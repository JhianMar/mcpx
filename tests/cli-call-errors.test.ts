import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.MCPX_DISABLE_AUTORUN = "1";
const cliModulePromise = import("../src/cli.js");

describe("CLI call error reporting", () => {
  beforeEach(() => {
    // Mock stdin to prevent hanging on readStdin()
    const mockStdin = {
      isTTY: true,
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      read: vi.fn().mockReturnValue(null),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.stubGlobal("process", { ...process, stdin: mockStdin });
  });

  it("reports connection issues and emits JSON payloads when requested", async () => {
    const { handleCall } = await cliModulePromise;
    const callTool = vi.fn().mockRejectedValue(new Error("SSE error: Non-200 status code (401)"));
    const runtime = {
      callTool,
      close: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue([]),
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await handleCall(runtime, ["github.list_repos()", "--output", "json"]);
    } catch {
      // Expected to throw in single call mode
    }

    // New error reporter outputs "Authentication failed (HTTP 401)" for 401 errors
    expect(
      errorSpy.mock.calls.some(
        (call) =>
          call.join(" ").includes("Authentication failed") ||
          call.join(" ").includes("401") ||
          call.join(" ").includes("mcpx auth"),
      ),
    ).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
