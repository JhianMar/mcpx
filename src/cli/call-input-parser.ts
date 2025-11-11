/**
 * Unified entry point for parsing call input
 *
 * Supports two formats:
 * 1. Data format: { tool: "server.tool", args: {...} }
 * 2. Function syntax: server.tool({ args })
 */

import type { CallData } from "@/cli/format-io.js";
import { parseCallData } from "@/cli/format-io.js";
import { parseFunctionSyntax } from "@/cli/function-syntax.js";

/**
 * Parse call input and normalize to CallData
 * Automatically detects format and routes to appropriate parser
 */
export function parseCallInput(input: string): CallData {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Empty input");
  }

  const format = inferFormat(trimmed);

  if (format === "function") {
    return parseFunctionSyntax(trimmed);
  }

  // Data format (JSON5/YAML/TOML/TOON)
  return parseCallData(trimmed, "auto");
}

/**
 * Infer input format from syntax
 */
function inferFormat(input: string): "data" | "function" {
  const trimmed = input.trim();

  // Data format: starts with { or [
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "data";
  }

  // Function syntax: matches server.tool(...)
  if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\s*\(/m.test(trimmed)) {
    return "function";
  }

  // Default to data format and let parseCallData handle errors
  return "data";
}
