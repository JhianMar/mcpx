import { describe, expect, test } from "vitest";
import {
  extractValidationErrors,
  findMatchingBracket,
  formatErrorForLLM,
  formatValidationErrors,
  type ValidationError,
} from "../src/cli/error-formatter.js";

describe("findMatchingBracket", () => {
  test("finds matching bracket in simple array", () => {
    const text = "text before [1, 2, 3] text after";
    const start = text.indexOf("[");
    const end = findMatchingBracket(text, start);

    expect(end).toBe(text.indexOf("]") + 1);
  });

  test("handles nested brackets", () => {
    const text = "text [1, [2, 3], 4] after";
    const start = text.indexOf("[");
    const end = findMatchingBracket(text, start);

    expect(end).toBe(text.lastIndexOf("]") + 1);
  });

  test("handles deeply nested structures", () => {
    const text = "[[[[]]]]";
    const end = findMatchingBracket(text, 0);

    expect(end).toBe(8);
  });

  test("returns -1 when no matching bracket found", () => {
    const text = "text [1, 2, 3";
    const start = text.indexOf("[");
    const end = findMatchingBracket(text, start);

    expect(end).toBe(-1);
  });

  test("handles empty array", () => {
    const text = "[]";
    const end = findMatchingBracket(text, 0);

    expect(end).toBe(2);
  });
});

describe("extractValidationErrors", () => {
  test("extracts validation errors from MCP error message", () => {
    const errorMsg = `MCP error -32602: Invalid arguments for tool ref_search_documentation: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["query"],
    "message": "Required"
  }
]`;

    const errors = extractValidationErrors(errorMsg);

    expect(errors).not.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors?.[0]).toEqual({
      code: "invalid_type",
      expected: "string",
      received: "undefined",
      path: ["query"],
      message: "Required",
    });
  });

  test("handles escaped newlines", () => {
    const errorMsg = String.raw`MCP error -32602: Invalid arguments for tool test: [\n  {\n    "code": "invalid_type",\n    "expected": "string",\n    "received": "undefined",\n    "path": ["query"],\n    "message": "Required"\n  }\n]`;

    const errors = extractValidationErrors(errorMsg);

    expect(errors).not.toBeNull();
    expect(errors).toHaveLength(1);
  });

  test("handles multiple validation errors", () => {
    const errorMsg = `Invalid arguments for tool test: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["query"],
    "message": "Required"
  },
  {
    "code": "invalid_type",
    "expected": "number",
    "received": "string",
    "path": ["limit"],
    "message": "Expected number"
  }
]`;

    const errors = extractValidationErrors(errorMsg);

    expect(errors).not.toBeNull();
    expect(errors).toHaveLength(2);
    expect(errors?.[1]?.path).toEqual(["limit"]);
  });

  test("returns null when no validation error present", () => {
    const errorMsg = "Tool not found";
    const errors = extractValidationErrors(errorMsg);

    expect(errors).toBeNull();
  });

  test("returns null when JSON is malformed", () => {
    const errorMsg = "Invalid arguments for tool test: [not valid json";
    const errors = extractValidationErrors(errorMsg);

    expect(errors).toBeNull();
  });

  test("handles nested path arrays correctly", () => {
    const errorMsg = `Invalid arguments for tool test: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["user", "address", "city"],
    "message": "Required"
  }
]`;

    const errors = extractValidationErrors(errorMsg);

    expect(errors).not.toBeNull();
    expect(errors?.[0]?.path).toEqual(["user", "address", "city"]);
  });
});

describe("formatValidationErrors", () => {
  test("formats single validation error", () => {
    const errors: ValidationError[] = [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["query"],
        message: "Required",
      },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toBe(
      `Parameter validation failed:\n- Field 'query': Required (expected string, got undefined)`,
    );
  });

  test("formats multiple validation errors", () => {
    const errors: ValidationError[] = [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["query"],
        message: "Required",
      },
      {
        code: "invalid_type",
        expected: "number",
        received: "string",
        path: ["limit"],
        message: "Expected number",
      },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toContain("- Field 'query': Required");
    expect(formatted).toContain("- Field 'limit': Expected number");
  });

  test("handles nested path with dot notation", () => {
    const errors: ValidationError[] = [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["user", "address", "city"],
        message: "Required",
      },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toContain("- Field 'user.address.city': Required");
  });

  test("handles empty path as root", () => {
    const errors: ValidationError[] = [
      {
        code: "invalid_type",
        expected: "object",
        received: "null",
        path: [],
        message: "Expected object",
      },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toContain("- Field 'root': Expected object");
  });
});

describe("formatErrorForLLM", () => {
  test("formats validation error with friendly message", () => {
    const error = new Error(`MCP error -32602: Invalid arguments for tool test: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["query"],
    "message": "Required"
  }
]`);

    const formatted = formatErrorForLLM(error);

    expect(formatted).toBe(
      `Parameter validation failed:\n- Field 'query': Required (expected string, got undefined)`,
    );
  });

  test("formats non-validation error with stack context", () => {
    const error = new Error("Tool not found");
    Error.captureStackTrace(error);

    const formatted = formatErrorForLLM(error);

    expect(formatted).toContain("Tool not found");
    expect(formatted).toContain("at ");
  });

  test("handles non-Error values", () => {
    const formatted = formatErrorForLLM("plain string error");

    expect(formatted).toBe("plain string error");
  });

  test("handles Error without stack", () => {
    const error = new Error("Simple error");
    error.stack = undefined;

    const formatted = formatErrorForLLM(error);

    expect(formatted).toBe("Simple error");
  });

  test("handles malformed validation error gracefully", () => {
    const error = new Error("Invalid arguments for tool test: [malformed json");

    const formatted = formatErrorForLLM(error);

    // Should fall back to regular error formatting
    expect(formatted).toContain("Invalid arguments for tool test");
  });
});
