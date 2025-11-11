/**
 * Batch call execution via stdin
 *
 * Input format (one call per line):
 * New syntax: { name: 'server.tool', args: { arg1: "value" } }
 * Old syntax: server.tool({ arg1: "value", arg2: 123 })
 *
 * Output format:
 * [
 *   { tool: "server.tool", output: { result... } },
 *   { tool: "server.tool2", output: { result... } }
 * ]
 */

import { parseExpressionAt } from "acorn";
import type {
  ArrayExpression,
  Expression,
  Literal,
  ObjectExpression,
  Property,
  UnaryExpression,
} from "estree";

export interface BatchCallInput {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface BatchCallResult {
  [key: string]: unknown;
}

const ACORN_OPTIONS = {
  ecmaVersion: "latest" as const,
  sourceType: "module" as const,
};

/**
 * Read stdin until EOF
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Parse a single call line
 * Supports both new syntax: { name: 'server.tool', args: {...} }
 * and old syntax: server.tool({ ... })
 */
export function parseCallLine(line: string): BatchCallInput | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return null; // Empty line or comment
  }

  // Try new syntax first: { name: 'server.tool', args: {...} }
  if (trimmed.startsWith("{")) {
    try {
      const expression = parseExpressionAt(trimmed, 0, ACORN_OPTIONS);
      if (expression.type === "ObjectExpression") {
        const obj = extractObject(expression as ObjectExpression);
        if (typeof obj.name === "string" && typeof obj.args === "object" && obj.args !== null) {
          const [server, tool] = obj.name.split(".");
          if (server && tool) {
            return {
              server,
              tool,
              args: obj.args as Record<string, unknown>,
            };
          }
        }
      }
    } catch {
      // Expected: new syntax parsing may fail; fall through to try old syntax
    }
  }

  // Old syntax: server.tool({ ... })
  const match = trimmed.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*\})\s*\)$/);
  if (!match) {
    throw new Error(`Invalid call syntax: ${trimmed}`);
  }

  const server = match[1];
  const tool = match[2];
  const argsJson = match[3];

  if (!server || !tool || !argsJson) {
    throw new Error(`Invalid call syntax: ${trimmed}`);
  }

  try {
    const expression = parseExpressionAt(argsJson, 0, ACORN_OPTIONS);
    if (expression.type !== "ObjectExpression") {
      throw new Error("Arguments must be an object");
    }
    const args = extractObject(expression as ObjectExpression);

    return {
      server,
      tool,
      args,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse arguments for ${server}.${tool}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

/**
 * Parse multiple call lines from stdin content
 */
export function parseBatchCalls(input: string): BatchCallInput[] {
  const lines = input.split("\n");
  const calls: BatchCallInput[] = [];

  for (const line of lines) {
    const parsed = parseCallLine(line);
    if (parsed) {
      calls.push(parsed);
    }
  }

  return calls;
}

// Helper functions extracted from call-expression-parser.ts

function extractObject(expression: ObjectExpression): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const property of expression.properties) {
    if (property.type !== "Property") {
      throw new Error("Unsupported property type in object expression.");
    }
    if (property.kind !== "init") {
      throw new Error("Only simple assignments are supported in object expressions.");
    }
    if (property.computed) {
      throw new Error("Computed property names are not supported in object expressions.");
    }
    const key = extractKey(property);
    const rawValue = property.value;
    if (!rawValue || !isSupportedValue(rawValue)) {
      throw new Error(`Unsupported expression type: ${rawValue ? rawValue.type : "null"}.`);
    }
    const value = extractValue(rawValue);
    result[key] = value;
  }
  return result;
}

function extractKey(property: Property): string {
  if (property.key.type === "Identifier") {
    return property.key.name;
  }
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value;
  }
  throw new Error("Invalid property name in object expression.");
}

function extractValue(value: Expression): unknown {
  switch (value.type) {
    case "Literal":
      return (value as Literal).value ?? null;
    case "ArrayExpression":
      return extractArray(value);
    case "ObjectExpression":
      return extractObject(value);
    case "UnaryExpression":
      return extractUnary(value);
    default:
      throw new Error(`Unsupported expression type: ${value.type}.`);
  }
}

function extractArray(arrayExpression: ArrayExpression): unknown[] {
  return arrayExpression.elements.map((element, index) => {
    if (!element) {
      throw new Error(`Sparse array entries are not supported (index ${index}).`);
    }
    if (element.type === "SpreadElement") {
      throw new Error("Spread elements are not supported in expressions.");
    }
    const elementType = (element as { type?: string }).type ?? "unknown";
    if (!isSupportedValue(element)) {
      throw new Error(`Unsupported expression type: ${elementType}.`);
    }
    return extractValue(element);
  });
}

function extractUnary(expression: UnaryExpression): unknown {
  if (expression.operator === "-" || expression.operator === "+") {
    const inner = expression.argument;
    if (inner.type !== "Literal" || typeof (inner as Literal).value !== "number") {
      throw new Error("Unary operators are only supported for numeric literals.");
    }
    const numericValue = Number((inner as Literal).value);
    return expression.operator === "-" ? -numericValue : numericValue;
  }
  if (expression.operator === "!") {
    const inner = expression.argument;
    if (inner.type !== "Literal" || typeof (inner as Literal).value !== "boolean") {
      throw new Error("Logical negation is only supported for boolean literals.");
    }
    return !(inner as Literal).value;
  }
  throw new Error(`Unsupported unary operator: ${expression.operator}`);
}

function isSupportedValue(node: unknown): node is Expression {
  if (!node || typeof node !== "object" || !("type" in node)) {
    return false;
  }
  const type = (node as { type: string }).type;
  return (
    type === "Literal" ||
    type === "ArrayExpression" ||
    type === "ObjectExpression" ||
    type === "UnaryExpression"
  );
}
