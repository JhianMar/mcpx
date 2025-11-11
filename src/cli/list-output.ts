import type { ServerDefinition } from "@/config.js";
import type { ToolMetadata } from "@/cli/tool-metadata.js";
import type { SerializedConnectionIssue } from "@/cli/json-output.js";
import { formatErrorMessage, serializeConnectionIssue } from "@/cli/json-output.js";
import type { ListSummaryResult, StatusCategory } from "@/cli/list-format.js";
import { classifyListError } from "@/cli/list-format.js";
import { schemaToTypeScript } from "@/cli/schema-to-typescript.js";
import {
  boldText,
  cyanText,
  dimText,
  extraDimText,
  supportsAnsiColor,
  yellowText,
} from "@/cli/terminal.js";
import { formatTransportSummary } from "@/cli/transport-utils.js";

export interface ToolDetailResult {
  examples: string[];
  optionalOmitted: boolean;
}

export interface ListJsonServerEntry {
  name: string;
  status: StatusCategory;
  durationMs: number;
  description?: string;
  transport?: string;
  source?: ServerDefinition["source"];
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }>;
  issue?: SerializedConnectionIssue;
  error?: string;
}

export function printSingleServerHeader(
  definition: ReturnType<
    Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>["getDefinition"]
  >,
  toolCount: number | undefined,
  durationMs: number | undefined,
  transportSummary: string,
  sourcePath: string | undefined,
  options?: { printSummaryNow?: boolean },
): string {
  const prefix = boldText(definition.name);
  if (definition.description) {
    console.log(`${prefix} - ${extraDimText(definition.description)}`);
  } else {
    console.log(prefix);
  }
  const summaryParts: string[] = [];
  summaryParts.push(
    extraDimText(
      typeof toolCount === "number"
        ? `${toolCount} tool${toolCount === 1 ? "" : "s"}`
        : "tools unavailable",
    ),
  );
  if (typeof durationMs === "number") {
    summaryParts.push(extraDimText(`${durationMs}ms`));
  }
  if (transportSummary) {
    summaryParts.push(extraDimText(transportSummary));
  }
  if (sourcePath) {
    summaryParts.push(sourcePath);
  }
  const summaryLine = `  ${summaryParts.join(extraDimText(" · "))}`;
  if (options?.printSummaryNow === false) {
    console.log("");
  } else {
    console.log(summaryLine);
    console.log("");
  }
  return summaryLine;
}

export function printToolDetail(
  _definition: ReturnType<
    Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>["getDefinition"]
  >,
  metadata: ToolMetadata,
): ToolDetailResult {
  const typeName = `${toPascalCase(metadata.tool.name)}Spec`;
  const cleanDescription = metadata.tool.description
    ? extractCoreDescription(metadata.tool.description)
    : undefined;

  // Print JSDoc comment if description exists
  if (cleanDescription) {
    console.log("/**");
    const descLines = cleanDescription.split("\n");
    for (const line of descLines) {
      console.log(` * ${line}`);
    }
    console.log(" */");
  }

  if (!metadata.tool.inputSchema) {
    // No schema - just print the spec with empty args
    const recordType = supportsAnsiColor
      ? dimText("Record<string, unknown>")
      : "Record<string, unknown>";
    console.log(formatTypeDeclaration(typeName, metadata.tool.name, recordType));
    console.log("");
    return { examples: [], optionalOmitted: false };
  }

  // Always inline args
  const argsOutput = schemaToTypeScript(metadata.tool.inputSchema, {
    typeName: "InlineArgs",
    exportType: false,
    indent: "  ",
    includeDescriptions: false,
  });
  // Extract the object literal from "type InlineArgs = { ... }"
  const argsMatch = argsOutput.match(/type InlineArgs = ([\s\S]+)/);
  let argsLiteral = argsMatch?.[1]?.trim() ?? "{}";

  // Add extra indentation and colorize types
  argsLiteral = colorizeTypeDefinition(argsLiteral);

  console.log(formatTypeDeclaration(typeName, metadata.tool.name, argsLiteral));
  console.log("");

  return { examples: [], optionalOmitted: false };
}

function formatTypeDeclaration(typeName: string, toolName: string, argsType: string): string {
  if (!supportsAnsiColor) {
    // Plain text version
    const lines = [`type ${typeName} = {`, `  tool: '${toolName}'`, `  args: ${argsType}`, `}`];
    return lines.join("\n");
  }

  // Colorized version
  const typeKeyword = extraDimText("type");
  const name = cyanText(typeName);
  const toolField = dimText("tool");
  const argsField = dimText("args");
  const toolNameLiteral = yellowText(`'${toolName}'`);

  const lines = [
    `${typeKeyword} ${name} = {`,
    `  ${toolField}: ${toolNameLiteral}`,
    `  ${argsField}: ${argsType}`,
    `}`,
  ];
  return lines.join("\n");
}

function colorizeTypeDefinition(typeDef: string): string {
  if (!supportsAnsiColor) {
    // Add indentation for non-colorized version
    return typeDef
      .split("\n")
      .map((line, idx) => {
        if (idx === 0) {
          return line;
        }
        return `  ${line}`;
      })
      .join("\n");
  }

  // Colorize TypeScript types
  const lines = typeDef.split("\n");
  return lines
    .map((line, idx) => {
      // Add indentation
      const indented = idx === 0 ? line : `  ${line}`;

      // Colorize types: string, number, boolean, array syntax, union types
      return indented
        .replace(/\bstring\b/g, dimText("string"))
        .replace(/\bnumber\b/g, dimText("number"))
        .replace(/\bboolean\b/g, dimText("boolean"))
        .replace(/\bunknown\b/g, dimText("unknown"))
        .replace(/\[\]/g, dimText("[]"))
        .replace(/'([^']+)'/g, (_, value) => yellowText(`'${value}'`));
    })
    .join("\n");
}

function toPascalCase(str: string): string {
  return str
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function extractCoreDescription(description: string): string {
  // Keep full description, only remove large <preserve> blocks
  let cleaned = description.replace(/<preserve>[\s\S]*?<\/preserve>/g, "");

  // Remove markdown headings prefix but keep the text
  cleaned = cleaned.replace(/^#+\s+/gm, "");

  // Split into lines and clean
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.join("\n");
}

function _buildExampleOptions(
  definition: ReturnType<
    Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>["getDefinition"]
  >,
): { selector?: string; wrapExpression?: boolean } | undefined {
  if (definition.source?.kind !== "local" || definition.source.path !== "<adhoc>") {
    return undefined;
  }
  if (definition.command.kind === "http") {
    const url =
      definition.command.url instanceof URL
        ? definition.command.url.href
        : String(definition.command.url);
    return { selector: url, wrapExpression: true };
  }
  return undefined;
}

export function createEmptyStatusCounts(): Record<StatusCategory, number> {
  return {
    ok: 0,
    auth: 0,
    offline: 0,
    http: 0,
    error: 0,
  };
}

export function summarizeStatusCounts(
  entries: ListJsonServerEntry[],
): Record<StatusCategory, number> {
  const counts = createEmptyStatusCounts();
  entries.forEach((entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  });
  return counts;
}

export function buildJsonListEntry(
  result: ListSummaryResult,
  timeoutSeconds: number,
): ListJsonServerEntry {
  if (result.status === "ok") {
    return {
      name: result.server.name,
      status: "ok",
      durationMs: result.durationMs,
      description: result.server.description,
      transport: formatTransportSummary(result.server),
      source: result.server.source,
      tools: result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
    };
  }
  const advice = classifyListError(result.error, result.server.name, timeoutSeconds);
  return {
    name: result.server.name,
    status: advice.category,
    durationMs: result.durationMs,
    description: result.server.description,
    transport: formatTransportSummary(result.server),
    source: result.server.source,
    issue: serializeConnectionIssue(advice.issue),
    error: formatErrorMessage(result.error),
  };
}

export function createUnknownResult(server: ServerDefinition): ListSummaryResult {
  return {
    status: "error",
    server,
    error: new Error("Unknown server result"),
    durationMs: 0,
  };
}

function _indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
