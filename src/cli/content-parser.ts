/**
 * Content parsing utilities for batch call results
 */

/**
 * Try to parse content field if it's a JSON string
 */
export function tryParseContent(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if ("content" in value) {
    const obj = value as Record<string, unknown>;
    const content = obj.content;

    // If content is a string, try to parse it as JSON
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        return {
          ...obj,
          content: parsed,
        };
      } catch {
        // Not JSON, return as-is
        return value;
      }
    }
  }

  return value;
}
