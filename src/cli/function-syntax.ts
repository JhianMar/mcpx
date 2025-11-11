/**
 * Parse function-call syntax into CallData
 *
 * Supports:
 * - Single call: server.tool({ args })
 * - Batch calls: server.tool1({ args }); server.tool2({ args })
 * - Multi-line: server.tool1()\nserver.tool2()
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
import type { CallData, SingleCallData } from "@/cli/format-io.js";

const ACORN_OPTIONS = {
  ecmaVersion: "latest" as const,
  sourceType: "module" as const,
};

/**
 * Parse function syntax: server.tool() or server.tool({ args })
 * Returns normalized CallData (single or batch)
 */
export function parseFunctionSyntax(input: string): CallData {
  const lines = splitCallExpressions(input);

  if (lines.length === 0) {
    throw new Error("No function calls found in input");
  }

  if (lines.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return parseSingleFunctionCall(lines[0]!);
  }

  return lines.map(parseSingleFunctionCall);
}

/**
 * Split input by semicolons or newlines
 */
function splitCallExpressions(input: string): string[] {
  return input
    .split(/[;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#") && !line.startsWith("//"));
}

/**
 * Parse single function call: server.tool({ args })
 */
function parseSingleFunctionCall(expr: string): SingleCallData {
  // Match: server.tool(args?)
  const match = expr.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*\((.*)\)$/s);

  if (!match) {
    throw new Error(`Invalid function syntax: '${expr}'. Expected format: server.tool({ args })`);
  }

  const [, server, toolName, argsStr] = match;
  const tool = `${server}.${toolName}`;

  // Empty args: server.tool()
  if (!argsStr || !argsStr.trim()) {
    return { tool, args: {} };
  }

  // Parse args as object literal
  const args = parseObjectLiteral(argsStr.trim());

  return { tool, args };
}

/**
 * Parse JavaScript object literal using acorn
 */
function parseObjectLiteral(argsStr: string): Record<string, unknown> {
  try {
    const expression = parseExpressionAt(argsStr, 0, ACORN_OPTIONS);

    if (expression.type !== "ObjectExpression") {
      throw new Error(`Arguments must be an object literal. Got: ${argsStr}`);
    }

    return extractObject(expression as ObjectExpression);
  } catch (error) {
    throw new Error(`Failed to parse arguments: ${(error as Error).message}`, { cause: error });
  }
}

// ============================================================================
// Object/Array/Value extraction from AST (copied from stdin-batch.ts)
// ============================================================================

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
