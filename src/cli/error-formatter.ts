/**
 * Error formatting utilities for batch call errors
 */

export type ValidationError = {
  code: string;
  expected: string;
  received: string;
  path: string[];
  message: string;
};

/**
 * Find the matching closing bracket for a JSON array using depth counting
 */
export function findMatchingBracket(text: string, startIndex: number): number {
  let depth = 0;

  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "[") {
      depth++;
    }
    if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}

/**
 * Extract validation errors from MCP error message
 */
export function extractValidationErrors(errorMessage: string): ValidationError[] | null {
  // Handle escaped newlines in the error message
  const cleanMessage = errorMessage.replace(/\\n/g, "\n");
  const startIdx = cleanMessage.indexOf("Invalid arguments for tool");

  if (startIdx === -1) {
    return null;
  }

  const arrayStart = cleanMessage.indexOf("[", startIdx);
  if (arrayStart === -1) {
    return null;
  }

  const arrayEnd = findMatchingBracket(cleanMessage, arrayStart);
  if (arrayEnd === -1) {
    return null;
  }

  try {
    const jsonStr = cleanMessage.substring(arrayStart, arrayEnd);
    return JSON.parse(jsonStr) as ValidationError[];
  } catch {
    // Expected: error message may contain malformed JSON; return null to indicate no validation errors
    return null;
  }
}

/**
 * Format validation errors into human-readable message
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  const formatted = errors
    .map((err) => {
      const field = err.path && err.path.length > 0 ? err.path.join(".") : "root";
      return `- Field '${field}': ${err.message} (expected ${err.expected}, got ${err.received})`;
    })
    .join("\n");

  return `Parameter validation failed:\n${formatted}`;
}

/**
 * Format error for LLM consumption - validation errors get friendly format,
 * other errors get message + first stack line for context
 */
export function formatErrorForLLM(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  // Check if it's a validation error (MCP error -32602)
  if (error.message.includes("Invalid arguments")) {
    const validationErrors = extractValidationErrors(error.message);
    if (validationErrors) {
      return formatValidationErrors(validationErrors);
    }
  }

  // Other errors: use message + first line of stack for context
  const stackLines = error.stack?.split("\n") || [];
  const contextLine = stackLines[1]?.trim() || "";

  return contextLine ? `${error.message}\n  ${contextLine}` : error.message;
}
