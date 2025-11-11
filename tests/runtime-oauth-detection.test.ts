import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { describe, expect, it, vi } from "vitest";

import type { ServerDefinition } from "../src/config.js";
import { __test } from "../src/runtime.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("maybeEnableOAuth", () => {
  const baseDefinition: ServerDefinition = {
    name: "adhoc-server",
    command: { kind: "http", url: new URL("https://example.com/mcp") },
    source: { kind: "local", path: "<adhoc>" },
  };

  it("returns an updated definition for HTTP servers", () => {
    const updated = __test.maybeEnableOAuth(baseDefinition, logger as never);
    expect(updated).toBeDefined();
    expect(updated?.auth).toBe("oauth");
    expect(updated?.tokenCacheDir).toContain("adhoc-server");
    expect(logger.info).toHaveBeenCalled();
  });

  it("enables OAuth for all HTTP servers (not just ad-hoc)", () => {
    const def: ServerDefinition = {
      name: "local-server",
      command: { kind: "http", url: new URL("https://example.com") },
      source: { kind: "local", path: "/tmp/config.json" },
    };
    const updated = __test.maybeEnableOAuth(def, logger as never);
    expect(updated).toBeDefined();
    expect(updated?.auth).toBe("oauth");
    expect(updated?.tokenCacheDir).toContain("local-server");
  });

  it("does not enable OAuth for already-configured OAuth servers", () => {
    const def: ServerDefinition = {
      name: "oauth-server",
      command: { kind: "http", url: new URL("https://example.com") },
      source: { kind: "local", path: "/tmp/config.json" },
      auth: "oauth",
    };
    const updated = __test.maybeEnableOAuth(def, logger as never);
    expect(updated).toBeUndefined();
  });

  it("does not enable OAuth for stdio servers", () => {
    const def: ServerDefinition = {
      name: "stdio-server",
      command: { kind: "stdio", command: "node", args: ["server.js"], cwd: "/tmp" },
      source: { kind: "local", path: "/tmp/config.json" },
    };
    const updated = __test.maybeEnableOAuth(def, logger as never);
    expect(updated).toBeUndefined();
  });

  it("does not enable OAuth for localhost servers", () => {
    const localhostUrls = [
      "http://localhost:8080/sse",
      "http://127.0.0.1:8080/sse",
      "http://[::1]:8080/sse",
      "http://192.168.1.100/mcp",
      "http://10.0.0.5:3000/mcp",
      "http://myserver.local/mcp",
    ];

    for (const url of localhostUrls) {
      const def: ServerDefinition = {
        name: "local-http-server",
        command: { kind: "http", url: new URL(url) },
        source: { kind: "local", path: "/tmp/config.json" },
      };
      const updated = __test.maybeEnableOAuth(def, logger as never);
      expect(updated).toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Skipping OAuth"));
      vi.clearAllMocks();
    }
  });
});

describe("isUnauthorizedError helper", () => {
  it("matches UnauthorizedError instances", () => {
    const err = new UnauthorizedError("Unauthorized");
    expect(__test.isUnauthorizedError(err)).toBe(true);
  });

  it("matches generic errors with 401 codes", () => {
    expect(__test.isUnauthorizedError(new Error("SSE error: Non-200 status code (401)"))).toBe(
      true,
    );
  });

  it("ignores unrelated errors", () => {
    expect(__test.isUnauthorizedError(new Error("network timeout"))).toBe(false);
  });
});
