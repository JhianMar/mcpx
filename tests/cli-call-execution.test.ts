import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

process.env.MCPX_DISABLE_AUTORUN = "1";

// Mock stdin to avoid "Premature close" errors in tests
const mockStdin = new Readable({
  read() {
    this.push(null); // Immediately end the stream
  },
}) as Readable & { isTTY: boolean };
mockStdin.isTTY = true;
Object.defineProperty(process, "stdin", {
  value: mockStdin,
  writable: true,
  configurable: true,
});

const cliModulePromise = import("../src/cli.js");

describe("CLI call execution behavior", () => {
  // Bun doesn't support timer mocking (advanceTimersByTime) yet, so we use real timers with a short delay
  it("aborts long-running tools when the timeout elapses", async () => {
    const { handleCall } = await cliModulePromise;
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      callTool: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("done"), 1000);
        }),
      close,
      listTools: vi.fn().mockResolvedValue([]),
    };

    // Use real timeout (10ms is fast enough for tests)
    await expect(
      handleCall(runtime as never, ["chrome-devtools.list_pages()", "--timeout", "10"]),
    ).rejects.toThrow("Call to chrome-devtools.list_pages timed out after 10ms.");

    expect(close).toHaveBeenCalledWith("chrome-devtools");
  });

  it("auto-corrects near-miss tool names", async () => {
    const { handleCall } = await cliModulePromise;
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new Error("MCP error -32602: Tool listIssues not found"))
      .mockResolvedValueOnce({ ok: true });
    const listTools = vi.fn().mockResolvedValue([{ name: "list_issues" }]);
    const runtime = {
      callTool,
      listTools,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleCall(runtime, ["linear.listIssues()"]);

    const notes = logSpy.mock.calls.map((call) => call.join(" "));
    expect(
      notes.some((line) => line.includes("Auto-corrected tool call to linear.list_issues")),
    ).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenNthCalledWith(1, "linear", "listIssues", {
      args: {},
    });
    expect(callTool).toHaveBeenNthCalledWith(2, "linear", "list_issues", {
      args: {},
    });
    expect(listTools).toHaveBeenCalledWith("linear", {
      autoAuthorize: true,
    });

    logSpy.mockRestore();
  });

  it("suggests similar tool names when the match is uncertain", async () => {
    const { handleCall } = await cliModulePromise;
    const callTool = vi
      .fn()
      .mockRejectedValue(new Error("MCP error -32602: Tool listIssues not found"));
    const listTools = vi.fn().mockResolvedValue([{ name: "list_issue_statuses" }]);
    const runtime = {
      callTool,
      listTools,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(handleCall(runtime, ["linear.listIssues()"])).rejects.toThrow(
      "listIssues not found",
    );

    const messages = errorSpy.mock.calls.map((call) => call.join(" "));
    expect(messages.some((line) => line.includes("Did you mean linear.list_issue_statuses"))).toBe(
      true,
    );

    errorSpy.mockRestore();
  });
});
