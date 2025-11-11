import { describe, expect, it } from "vitest";

process.env.MCPX_DISABLE_AUTORUN = "1";
const cliModulePromise = import("../src/cli.js");

describe("CLI call argument parsing", () => {
  it("falls back to default call timeout when env is empty", async () => {
    const original = process.env.MCPX_CALL_TIMEOUT;
    process.env.MCPX_CALL_TIMEOUT = "";
    try {
      const { resolveCallTimeout } = await cliModulePromise;
      expect(resolveCallTimeout()).toBe(60_000);
    } finally {
      if (original === undefined) {
        delete process.env.MCPX_CALL_TIMEOUT;
      } else {
        process.env.MCPX_CALL_TIMEOUT = original;
      }
    }
  });

  it("accepts server and tool as separate positional arguments", async () => {
    const { parseCallArguments } = await cliModulePromise;
    const parsed = parseCallArguments(["chrome-devtools", "list_pages"]);
    expect(parsed.selector).toBe("chrome-devtools");
    expect(parsed.tool).toBe("list_pages");
    expect(parsed.args).toEqual({});
  });

  it("captures timeout flag values", async () => {
    const { parseCallArguments } = await cliModulePromise;
    const parsed = parseCallArguments([
      "chrome-devtools",
      "--timeout",
      "2500",
      "--tool",
      "list_pages",
    ]);
    expect(parsed.selector).toBe("chrome-devtools");
    expect(parsed.tool).toBe("list_pages");
    expect(parsed.timeoutMs).toBe(2500);
  });

  it("parses --args JSON objects", async () => {
    const { parseCallArguments } = await cliModulePromise;
    const parsed = parseCallArguments([
      "linear",
      "create_comment",
      "--args",
      '{"issueId":"ISSUE-123","notify":false}',
    ]);
    expect(parsed.selector).toBe("linear");
    expect(parsed.tool).toBe("create_comment");
    expect(parsed.args).toEqual({ issueId: "ISSUE-123", notify: false });
  });
});
