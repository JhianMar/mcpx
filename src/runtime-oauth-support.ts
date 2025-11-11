import os from "node:os";
import path from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { ServerDefinition } from "@/config.js";
import type { Logger } from "@/logging.js";

/**
 * Check if a hostname is localhost or a local address.
 * This prevents OAuth flows from being triggered for local MCP servers.
 */
function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized) // 172.16-31.x.x
  );
}

export function maybeEnableOAuth(
  definition: ServerDefinition,
  logger: Logger,
): ServerDefinition | undefined {
  // Don't override explicit auth setting
  if (definition.auth !== undefined) {
    return undefined;
  }

  // Only HTTP servers can use OAuth
  if (definition.command.kind !== "http") {
    return undefined;
  }

  // Never attempt OAuth for localhost/local network servers
  // These are typically mcp-proxy wrapping stdio servers or local dev servers
  try {
    const url = new URL(definition.command.url);
    if (isLocalhost(url.hostname)) {
      logger.info(`Skipping OAuth for '${definition.name}' - localhost server (${url.hostname})`);
      return undefined;
    }
  } catch {
    // Invalid URL - let it fail naturally elsewhere
    return undefined;
  }

  const tokenCacheDir =
    definition.tokenCacheDir ?? path.join(os.homedir(), ".mcpx", definition.name);
  logger.info(`Detected OAuth requirement for '${definition.name}'. Launching browser flow...`);
  return {
    ...definition,
    auth: "oauth",
    tokenCacheDir,
  };
}

/**
 * Check if an error is an actual OAuth unauthorized error.
 * This checks for:
 * 1. UnauthorizedError from the MCP SDK
 * 2. HTTP 401/403 status codes from transport layers
 *
 * This is stricter than the general error classifier to avoid false positives
 * from network errors, timeouts, or other transient issues.
 */
export function isUnauthorizedError(error: unknown): boolean {
  // Direct UnauthorizedError from MCP SDK
  if (error instanceof UnauthorizedError) {
    return true;
  }

  // Check for HTTP 401/403 status codes in error messages
  // These come from SSE/StreamableHTTP transports that don't throw UnauthorizedError
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Match patterns like:
    // - "SSE error: Non-200 status code (401)"
    // - "status code (403)"
    // - "HTTP 401"
    const hasAuthStatus =
      /status code\s*\(?\s*(401|403)\s*\)?/i.test(error.message) ||
      /\bhttp\s+(401|403)\b/i.test(error.message);

    // Exclude patterns that indicate other issues (connection errors, timeouts)
    // to avoid triggering OAuth on transient network problems
    const isConnectionError =
      message.includes("connection refused") ||
      message.includes("connection reset") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("fetch failed") ||
      message.includes("network");

    return hasAuthStatus && !isConnectionError;
  }

  return false;
}
