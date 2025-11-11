import { describe, expect, it, vi } from "vitest";
import { buildToolMetadata } from "../src/cli/tool-metadata.js";
import type { ListSummaryResult } from "../src/cli/list-format.js";
import {
  buildJsonListEntry,
  createEmptyStatusCounts,
  printSingleServerHeader,
  printToolDetail,
} from "../src/cli/list-output.js";
import type { ServerDefinition } from "../src/config.js";
import type { ServerToolInfo } from "../src/runtime.js";

describe("list output helpers", () => {
  const definition: ServerDefinition = {
    name: "demo",
    description: "Demo server",
    command: { kind: "http", url: new URL("https://demo.example.com/mcp") },
    source: { kind: "local", path: "/tmp/mcpx.json" },
  };

  it("renders single server headers with tool counts and transport info", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const summary = printSingleServerHeader(
      definition,
      2,
      42,
      "HTTP https://demo.example.com/mcp",
      "config/demo",
    );
    expect(summary).toContain("2 tools");
    expect(summary).toContain("42ms");
    expect(summary).toContain("HTTP https://demo.example.com/mcp");
    logSpy.mockRestore();
  });

  it("prints tool details in Spec format", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tool: ServerToolInfo = {
      name: "add",
      description: "Add numbers",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number", description: "First operand" },
          b: { type: "number", description: "Second operand" },
          format: {
            type: "string",
            enum: ["json", "markdown"],
            description: "Format",
          },
        },
        required: ["a", "b"],
      },
      outputSchema: { type: "number" },
    };
    const metadata = buildToolMetadata(tool);
    const detail = printToolDetail(definition, metadata);
    expect(detail.optionalOmitted).toBe(false);
    expect(detail.examples).toEqual([]);
    // Verify Spec format output
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("type AddSpec = {");
    expect(output).toContain("tool: 'add'");
    logSpy.mockRestore();
  });

  it("prints Spec format for ad-hoc HTTP servers", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const adhocDefinition: ServerDefinition = {
      name: "mcp-sentry-dev-mcp",
      description: "Ad-hoc Sentry",
      command: {
        kind: "http",
        url: new URL("https://mcp.sentry.dev/mcp?agent=1"),
      },
      source: { kind: "local", path: "<adhoc>" },
    };
    const tool: ServerToolInfo = {
      name: "use_sentry",
      description: "Proxy to Sentry",
      inputSchema: {
        type: "object",
        properties: {
          request: { type: "string", description: "Instruction" },
        },
        required: ["request"],
      },
      outputSchema: { type: "object" },
    };
    const metadata = buildToolMetadata(tool);
    const detail = printToolDetail(adhocDefinition, metadata);
    expect(detail.examples).toEqual([]);
    // Verify Spec format output
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("type UseSentrySpec = {");
    expect(output).toContain("tool: 'use_sentry'");
    logSpy.mockRestore();
  });

  it("builds JSON summaries for successful servers", () => {
    const summary: ListSummaryResult = {
      status: "ok",
      server: definition,
      durationMs: 12,
      tools: [
        {
          name: "add",
          description: "Add numbers",
          inputSchema: { type: "object" },
          outputSchema: { type: "number" },
        },
      ],
    };
    const entry = buildJsonListEntry(summary, 30);
    expect(entry.status).toBe("ok");
    expect(entry.tools?.[0]?.name).toBe("add");
    expect(entry.tools?.[0]?.inputSchema).toBeDefined();
  });

  it("includes auth hints for error summaries", () => {
    const summary: ListSummaryResult = {
      status: "error",
      server: definition,
      durationMs: 1000,
      error: new Error("HTTP error 401"),
    };
    const entry = buildJsonListEntry(summary, 5);
    expect(entry.status).toBe("auth");
    expect(entry.error).toContain("401");
    expect(entry.issue?.kind).toBe("auth");
  });

  it("creates empty status counts with zeroed categories", () => {
    const counts = createEmptyStatusCounts();
    expect(counts).toEqual({ ok: 0, auth: 0, offline: 0, http: 0, error: 0 });
  });
});
