import { describe, expect, it, vi } from "vitest";
import type { ServerDefinition } from "../src/config.js";
import {
  buildLinearDocumentsTool,
  cliModulePromise,
  linearDefinition,
  stripAnsi,
} from "./fixtures/cli-list-fixtures.js";

describe("CLI list formatting", () => {
  it("prints detailed usage for single server listings", async () => {
    const { handleList } = await cliModulePromise;
    const listToolsSpy = vi.fn((_name: string, _options?: { autoAuthorize?: boolean }) =>
      Promise.resolve([
        {
          name: "add",
          description: "Add two numbers",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number", description: "First operand" },
              format: {
                type: "string",
                enum: ["json", "markdown"],
                description: "Output serialization format",
              },
              dueBefore: {
                type: "string",
                format: "date-time",
                description: "ISO 8601 timestamp",
              },
            },
            required: ["a"],
          },
          outputSchema: {
            type: "object",
            properties: {
              result: {
                type: "array",
                description: "List of calculation results",
              },
              total: {
                type: "number",
                description: "Total results returned",
              },
            },
          },
        },
      ]),
    );
    const runtime = {
      getDefinition: (name: string) => ({
        name,
        description: "Test integration server",
        command: { kind: "http", url: new URL("https://example.com/mcp") },
      }),
      listTools: listToolsSpy,
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleList(runtime, ["calculator"]);

    const rawLines = logSpy.mock.calls.map((call) => call.join(" "));
    const lines = rawLines.map(stripAnsi);

    const headerLine = lines.find((line) => line.trim().startsWith("calculator -"));
    expect(headerLine).toBeDefined();
    const summaryLine = lines.find((line) => line.includes("HTTP https://example.com/mcp"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toMatch(/1 tool/);
    expect(summaryLine).toMatch(/ms/);
    expect(summaryLine).toContain("HTTP https://example.com/mcp");
    expect(lines.some((line) => line.includes("/**"))).toBe(true);
    expect(lines.some((line) => line.includes("type AddSpec = {"))).toBe(true);
    expect(lines.some((line) => line.includes("tool: 'add'"))).toBe(true);
    expect(lines.some((line) => line.includes("args:"))).toBe(true);
    expect(listToolsSpy).toHaveBeenCalledWith("calculator", expect.anything());

    logSpy.mockRestore();
  });

  it("emits JSON summaries for multi-server listings when --output json is provided", async () => {
    const { handleList } = await cliModulePromise;
    const originalCI = process.env.CI;
    process.env.CI = "1";
    const definitions: ServerDefinition[] = [
      linearDefinition,
      {
        name: "github",
        command: { kind: "http", url: new URL("https://example.com/mcp") },
      },
    ];
    const runtime = {
      getDefinitions: () => definitions,
      listTools: (name: string) => {
        if (name === "linear") {
          return Promise.resolve([{ name: "list_documents" }]);
        }
        return Promise.reject(new Error("HTTP error 500: upstream unavailable"));
      },
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await handleList(runtime, ["--output", "json"]);
    const payload = JSON.parse(logSpy.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.mode).toBe("list");
    expect(payload.servers).toHaveLength(2);
    const github = payload.servers.find((entry: { name: string }) => entry.name === "github");
    expect(github.status).toBe("http");
    const linear = payload.servers.find((entry: { name: string }) => entry.name === "linear");
    expect(linear.tools[0].name).toBe("list_documents");
    logSpy.mockRestore();
    process.env.CI = originalCI;
  });

  it("emits JSON payloads for single server listings when --output json is provided", async () => {
    const { handleList } = await cliModulePromise;
    const toolCache = await import("../src/cli/tool-cache.js");
    const metadata = [
      {
        tool: {
          name: "add",
          description: "Add numbers",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" } },
            required: ["a"],
          },
          outputSchema: { type: "number" },
        },
        methodName: "add",
        options: [],
      },
    ];
    const metadataSpy = vi
      .spyOn(toolCache, "loadToolMetadata")
      .mockResolvedValue(metadata as never);
    const definition: ServerDefinition = {
      name: "linear",
      description: "Hosted Linear MCP",
      command: { kind: "http", url: new URL("https://example.com/mcp") },
    };
    const runtime = {
      getDefinitions: () => [definition],
      getDefinition: () => definition,
      registerDefinition: vi.fn(),
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleList(runtime, ["--output", "json", "linear"]);

    const payload = JSON.parse(logSpy.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.mode).toBe("server");
    expect(payload.status).toBe("ok");
    expect(payload.tools[0].name).toBe("add");

    logSpy.mockRestore();
    metadataSpy.mockRestore();
  });

  it("formats all parameters in Spec type format", async () => {
    const { handleList } = await cliModulePromise;
    const listToolsSpy = vi.fn((_name: string, _options?: { autoAuthorize?: boolean }) =>
      Promise.resolve([buildLinearDocumentsTool()]),
    );
    const runtime = {
      getDefinition: () => linearDefinition,
      listTools: listToolsSpy,
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleList(runtime, ["linear"]);

    const lines = logSpy.mock.calls.map((call) => stripAnsi(call.join(" ")));
    expect(lines.some((line) => line.includes("type ListDocumentsSpec = {"))).toBe(true);
    expect(lines.some((line) => line.includes("tool: 'list_documents'"))).toBe(true);
    expect(lines.some((line) => line.includes("args: {"))).toBe(true);
    expect(lines.some((line) => line.includes("query: string"))).toBe(true);
    expect(lines.some((line) => line.includes("limit?: number"))).toBe(true);
    expect(listToolsSpy).toHaveBeenCalledWith("linear", expect.anything());

    logSpy.mockRestore();
  });

  it("displays Spec format output for tools", async () => {
    const { handleList } = await cliModulePromise;
    const listToolsSpy = vi.fn((_name: string, _options?: { autoAuthorize?: boolean }) =>
      Promise.resolve([buildLinearDocumentsTool()]),
    );
    const runtime = {
      getDefinition: () => linearDefinition,
      listTools: listToolsSpy,
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleList(runtime, ["linear"]);

    const lines = logSpy.mock.calls.map((call) => stripAnsi(call.join(" ")));
    expect(lines.some((line) => line.includes("/**"))).toBe(true);
    expect(lines.some((line) => line.includes("type ListDocumentsSpec = {"))).toBe(true);
    expect(lines.some((line) => line.includes("tool: 'list_documents'"))).toBe(true);

    logSpy.mockRestore();
  });

  it("displays tool schema with required and optional parameters", async () => {
    const { handleList } = await cliModulePromise;
    const listToolsSpy = vi.fn((_name: string, _options?: { autoAuthorize?: boolean }) =>
      Promise.resolve([
        {
          name: "list_projects",
          description: "List Vercel projects",
          inputSchema: {
            type: "object",
            properties: {
              teamId: {
                type: "string",
                description: `The team ID to target.\nTeam IDs start with "team_".\n- Read the file .vercel/project.json\n- Use the list_teams tool`,
              },
            },
            required: ["teamId"],
          },
        },
      ]),
    );
    const runtime = {
      getDefinition: () => linearDefinition,
      listTools: listToolsSpy,
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleList(runtime, ["linear"]);

    const lines = logSpy.mock.calls.map((call) => stripAnsi(call.join(" ")));
    expect(lines.some((line) => line.includes("/**"))).toBe(true);
    expect(lines.some((line) => line.includes("List Vercel projects"))).toBe(true);
    expect(lines.some((line) => line.includes("type ListProjectsSpec = {"))).toBe(true);
    expect(lines.some((line) => line.includes("tool: 'list_projects'"))).toBe(true);
    expect(lines.some((line) => line.includes("teamId: string"))).toBe(true);

    logSpy.mockRestore();
  });

  it("matches the expected formatted snapshot for a complex server", async () => {
    const { handleList } = await cliModulePromise;
    const listToolsSpy = vi.fn((_name: string, _options?: { autoAuthorize?: boolean }) =>
      Promise.resolve([
        buildLinearDocumentsTool(),
        {
          name: "create_comment",
          description: "Create a comment on a specific Linear issue",
          inputSchema: {
            type: "object",
            properties: {
              issueId: { type: "string", description: "The issue ID" },
              parentId: {
                type: "string",
                description: "Optional parent comment ID",
              },
              body: {
                type: "string",
                description: "Comment body as Markdown",
              },
            },
            required: ["issueId", "body"],
          },
          outputSchema: {
            title: "Comment",
            type: "object",
          },
        },
      ]),
    );
    const runtime = {
      getDefinition: () => linearDefinition,
      listTools: listToolsSpy,
    } as unknown as Awaited<ReturnType<(typeof import("../src/runtime.js"))["createRuntime"]>>;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    await handleList(runtime, ["linear"]);

    nowSpy.mockRestore();

    const lines = logSpy.mock.calls.map((call) => stripAnsi(call.join(" ")));
    expect(lines.join("\n")).toMatchInlineSnapshot(`
      "linear - Hosted Linear MCP
        2 tools · 0ms · HTTP https://example.com/mcp

      /**
       * List documents in the user's Linear workspace
       */
      type ListDocumentsSpec = {
        tool: 'list_documents'
        args: {
          query: string
          limit?: number
          before?: string
          after?: string
          orderBy?: 'createdAt' | 'updatedAt'
          projectId?: string
          initiativeId?: string
          creatorId?: string
          includeArchived?: boolean
        }
      }

      /**
       * Create a comment on a specific Linear issue
       */
      type CreateCommentSpec = {
        tool: 'create_comment'
        args: {
          issueId: string
          parentId?: string
          body: string
        }
      }
      "
    `);

    logSpy.mockRestore();
  });
});
