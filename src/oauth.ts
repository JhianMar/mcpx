import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { ServerDefinition } from "@/config.js";
import { readJsonFile, writeJsonFile } from "@/fs-json.js";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

// createDeferred produces a minimal promise wrapper for async coordination.
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// openExternal attempts to launch the system browser cross-platform.
function openExternal(url: string) {
  const platform = process.platform;
  const stdio = "ignore";
  try {
    if (platform === "darwin") {
      const child = spawn("open", [url], { stdio, detached: true });
      child.unref();
    } else if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", '""', url], {
        stdio,
        detached: true,
      });
      child.unref();
    } else {
      const child = spawn("xdg-open", [url], { stdio, detached: true });
      child.unref();
    }
  } catch {
    // best-effort: fall back to printing URL
  }
}

// ensureDirectory guarantees a directory exists before writing JSON blobs.
// Sets mode 0o700 (owner-only) to protect sensitive OAuth data.
async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

// FileOAuthClientProvider persists OAuth session artifacts to disk and captures callback redirects.
class FileOAuthClientProvider implements OAuthClientProvider {
  private readonly tokenPath: string;
  private readonly clientInfoPath: string;
  private readonly metadata: OAuthClientMetadata;
  private readonly logger: OAuthLogger;
  private redirectUrlValue: URL;
  private authorizationDeferred: Deferred<string> | null = null;
  private cachedAuthorizationCode: string | null = null;
  private authFinishedFlag = false;
  private server?: http.Server;
  private stateValue: string;
  private codeVerifierValue: string;

  private constructor(
    private readonly definition: ServerDefinition,
    tokenCacheDir: string,
    redirectUrl: URL,
    logger: OAuthLogger,
  ) {
    this.tokenPath = path.join(tokenCacheDir, "tokens.json");
    this.clientInfoPath = path.join(tokenCacheDir, "client.json");
    this.redirectUrlValue = redirectUrl;
    this.logger = logger;
    this.stateValue = randomUUID();
    this.codeVerifierValue = randomUUID();
    this.metadata = {
      client_name: definition.clientName ?? `mcpx (${definition.name})`,
      redirect_uris: [this.redirectUrlValue.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    };
  }

  static async create(
    definition: ServerDefinition,
    logger: OAuthLogger,
  ): Promise<{
    provider: FileOAuthClientProvider;
    close: () => Promise<void>;
  }> {
    const tokenDir = definition.tokenCacheDir ?? path.join(os.homedir(), ".mcpx", definition.name);
    await ensureDirectory(tokenDir);

    const server = http.createServer();
    const overrideRedirect = definition.oauthRedirectUrl
      ? new URL(definition.oauthRedirectUrl)
      : null;
    const listenHost = overrideRedirect?.hostname ?? CALLBACK_HOST;
    const desiredPort = overrideRedirect?.port
      ? Number.parseInt(overrideRedirect.port, 10)
      : undefined;
    const callbackPath =
      overrideRedirect?.pathname && overrideRedirect.pathname !== "/"
        ? overrideRedirect.pathname
        : CALLBACK_PATH;
    const port = await new Promise<number>((resolve, reject) => {
      server.listen(desiredPort ?? 0, listenHost, () => {
        const address = server.address();
        if (typeof address === "object" && address && "port" in address) {
          resolve(address.port);
        } else {
          reject(new Error("Failed to determine callback port"));
        }
      });
      server.once("error", (error) => reject(error));
    });

    const redirectUrl = overrideRedirect
      ? new URL(overrideRedirect.toString())
      : new URL(`http://${listenHost}:${port}${callbackPath}`);
    if (!overrideRedirect || overrideRedirect.port === "") {
      redirectUrl.port = String(port);
    }
    if (
      !overrideRedirect ||
      overrideRedirect.pathname === "/" ||
      overrideRedirect.pathname === ""
    ) {
      redirectUrl.pathname = callbackPath;
    }

    const provider = new FileOAuthClientProvider(definition, tokenDir, redirectUrl, logger);
    provider.attachServer(server);
    return {
      provider,
      close: async () => {
        await provider.close();
      },
    };
  }

  // attachServer listens for the OAuth redirect and resolves/rejects the deferred code promise.
  private attachServer(server: http.Server) {
    this.server = server;
    server.on("request", async (req, res) => {
      try {
        const url = req.url ?? "";
        if (!url.startsWith("/callback")) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const parsed = new URL(url, this.redirectUrlValue);
        const code = parsed.searchParams.get("code");
        const error = parsed.searchParams.get("error");
        if (code) {
          this.logger.info(`Received OAuth authorization code for ${this.definition.name}`);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<html><body><h1>Authorization successful</h1><p>You can return to the CLI.</p></body></html>",
          );
          this.cachedAuthorizationCode = code;
          this.authorizationDeferred?.resolve(code);
          this.authorizationDeferred = null;
        } else if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html");
          res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p></body></html>`);
          this.authorizationDeferred?.reject(new Error(`OAuth error: ${error}`));
          this.authorizationDeferred = null;
        } else {
          res.statusCode = 400;
          res.end("Missing authorization code");
          this.authorizationDeferred?.reject(new Error("Missing authorization code"));
          this.authorizationDeferred = null;
        }
      } catch (error) {
        this.authorizationDeferred?.reject(error);
        this.authorizationDeferred = null;
      }
    });
  }

  get redirectUrl(): string | URL {
    return this.redirectUrlValue;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.metadata;
  }

  async state(): Promise<string> {
    return this.stateValue;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return readJsonFile<OAuthClientInformationMixed>(this.clientInfoPath);
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await writeJsonFile(this.clientInfoPath, clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return readJsonFile<OAuthTokens>(this.tokenPath);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJsonFile(this.tokenPath, tokens);
    this.logger.info(`Saved OAuth tokens for ${this.definition.name} to ${this.tokenPath}`);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.logger.info(`Authorization required for ${this.definition.name}. Opening browser...`);
    this.authorizationDeferred = createDeferred<string>();
    openExternal(authorizationUrl.toString());
    this.logger.info(`If the browser did not open, visit ${authorizationUrl.toString()} manually.`);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.codeVerifierValue = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this.codeVerifierValue;
  }

  // invalidateCredentials removes cached files to force the next OAuth flow.
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): Promise<void> {
    const removals: string[] = [];
    if (scope === "all" || scope === "tokens") {
      removals.push(this.tokenPath);
    }
    if (scope === "all" || scope === "client") {
      removals.push(this.clientInfoPath);
    }
    // verifier is in-memory only, no file to remove
    await Promise.all(
      removals.map(async (file) => {
        try {
          await fs.unlink(file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }),
    );
  }

  // waitForAuthorizationCode resolves once the local callback server captures a redirect.
  // Multiple calls within the same OAuth session will return the same cached code.
  async waitForAuthorizationCode(): Promise<string> {
    if (this.cachedAuthorizationCode) {
      return this.cachedAuthorizationCode;
    }
    if (!this.authorizationDeferred) {
      this.authorizationDeferred = createDeferred<string>();
    }
    return this.authorizationDeferred.promise;
  }

  // markAuthFinished marks the OAuth flow as complete (finishAuth was called).
  markAuthFinished(): void {
    this.authFinishedFlag = true;
  }

  // hasFinishedAuth returns true if finishAuth has already been called for this session.
  hasFinishedAuth(): boolean {
    return this.authFinishedFlag;
  }

  // close stops the temporary callback server created for the OAuth session.
  async close(): Promise<void> {
    if (this.authorizationDeferred) {
      // If the CLI is tearing down mid-flow, reject the pending wait promise so runtime shutdown isn't blocked.
      this.authorizationDeferred.reject(
        new Error("OAuth session closed before receiving authorization code."),
      );
      this.authorizationDeferred = null;
    }
    this.cachedAuthorizationCode = null;
    this.authFinishedFlag = false;
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = undefined;
  }
}

export interface OAuthSession {
  provider: OAuthClientProvider & {
    waitForAuthorizationCode: () => Promise<string>;
    markAuthFinished: () => void;
    hasFinishedAuth: () => boolean;
  };
  waitForAuthorizationCode: () => Promise<string>;
  markAuthFinished: () => void;
  hasFinishedAuth: () => boolean;
  close: () => Promise<void>;
}

// createOAuthSession spins up a file-backed OAuth provider and callback server for the target definition.
export async function createOAuthSession(
  definition: ServerDefinition,
  logger: OAuthLogger,
): Promise<OAuthSession> {
  const { provider, close } = await FileOAuthClientProvider.create(definition, logger);
  const waitForAuthorizationCode = () => provider.waitForAuthorizationCode();
  const markAuthFinished = () => provider.markAuthFinished();
  const hasFinishedAuth = () => provider.hasFinishedAuth();
  return {
    provider,
    waitForAuthorizationCode,
    markAuthFinished,
    hasFinishedAuth,
    close,
  };
}
export interface OAuthLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
