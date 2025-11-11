import {
  parseJSON5,
  parseYAML,
  parseTOML,
  stringifyJSON,
  stringifyYAML,
  stringifyTOML,
} from "confbox";
import { encode as encodeToToon, decode as decodeFromToon } from "@toon-format/toon";

/**
 * Supported input/output formats for call data
 */
export type DataFormat = "json" | "json5" | "yaml" | "toml" | "toon" | "auto";

/**
 * Single call data structure
 */
export type SingleCallData = {
  tool: string;
  args?: Record<string, unknown>;
};

/**
 * Batch call data structure
 */
export type BatchCallData = SingleCallData[];

/**
 * Call data can be single or batch
 */
export type CallData = SingleCallData | BatchCallData;

/**
 * Single call result
 */
export type SingleCallResult = {
  tool: string;
  output: unknown;
};

/**
 * Batch call results
 */
export type BatchCallResult = SingleCallResult[];

/**
 * Call result can be single or batch
 */
export type CallResult = SingleCallResult | BatchCallResult;

/**
 * Parse call data from string in various formats
 */
export function parseCallData(input: string, format: DataFormat = "auto"): CallData {
  const trimmed = input.trim();

  // Auto-detect format
  if (format === "auto") {
    format = detectFormat(trimmed);
  }

  switch (format) {
    case "toon": {
      try {
        // Type assertion needed: decodeFromToon returns JsonValue, we expect CallData
        return decodeFromToon(trimmed) as CallData;
      } catch (error) {
        throw new Error(`Failed to parse TOON format: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }

    case "json":
    case "json5": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        return parseJSON5(trimmed) as CallData;
      } catch (error) {
        throw new Error(`Failed to parse JSON/JSON5: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }

    case "yaml": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        return parseYAML(trimmed) as CallData;
      } catch (error) {
        throw new Error(`Failed to parse YAML: ${(error as Error).message}`, { cause: error });
      }
    }

    case "toml": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        return parseTOML(trimmed) as CallData;
      } catch (error) {
        throw new Error(`Failed to parse TOML: ${(error as Error).message}`, { cause: error });
      }
    }

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Format call result to string in specified format
 */
export function formatCallResult(result: CallResult, format: DataFormat = "toon"): string {
  if (format === "auto") {
    format = "toon";
  }

  switch (format) {
    case "toon": {
      try {
        return encodeToToon(result);
      } catch {
        // Fallback to JSON if TOON encoding fails
        return JSON.stringify(result, null, 2);
      }
    }

    case "json":
    case "json5": {
      return stringifyJSON(result);
    }

    case "yaml": {
      try {
        return stringifyYAML(result);
      } catch {
        // Expected: YAML serialization may fail for complex data structures; fall back to JSON
        return stringifyJSON(result);
      }
    }

    case "toml": {
      try {
        return stringifyTOML(result);
      } catch {
        // Expected: TOML serialization may fail for complex data structures; fall back to JSON
        return stringifyJSON(result);
      }
    }

    default:
      throw new Error(`Unsupported output format: ${String(format)}`);
  }
}

/**
 * Detect format from input string
 */
function detectFormat(input: string): DataFormat {
  const trimmed = input.trim();

  // Check for TOON format (has specific patterns)
  if (isToonFormat(trimmed)) {
    return "toon";
  }

  // Check for JSON (starts with { or [)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json5"; // Use JSON5 parser for better error tolerance
  }

  // Check for YAML (has : without quotes or starts with -)
  if (trimmed.includes(":\n") || trimmed.includes(": ") || trimmed.startsWith("-")) {
    return "yaml";
  }

  // Check for TOML (has [section] or key = value)
  if ((trimmed.includes("[") && trimmed.includes("]")) || /^\w+\s*=/.test(trimmed)) {
    return "toml";
  }

  // Default to JSON5
  return "json5";
}

/**
 * Check if input looks like TOON format
 */
function isToonFormat(input: string): boolean {
  // TOON uses specific delimiters and patterns
  // This is a heuristic check
  const toonPatterns = [
    /^tool:\s/m,
    /^output:\s/m,
    /^\s*\|\s/m, // TOON arrays
  ];

  return toonPatterns.some((pattern) => pattern.test(input));
}

/**
 * Normalize call data to always return array format
 */
export function normalizeToArray(data: CallData): BatchCallData {
  return Array.isArray(data) ? data : [data];
}

/**
 * Check if call data is batch
 */
export function isBatchCall(data: CallData): data is BatchCallData {
  return Array.isArray(data);
}

/**
 * Parse tool string (e.g., "server.tool") into parts
 */
export function parseToolString(fn: string): { server: string; tool: string } {
  const parts = fn.split(".");
  if (parts.length < 2) {
    throw new Error(`Invalid tool format: '${fn}'. Expected 'server.tool' format.`);
  }

  const server = parts[0];
  const tool = parts.slice(1).join(".");

  if (!server || !tool) {
    throw new Error(`Invalid tool format: '${fn}'. Both server and tool must be non-empty.`);
  }

  return { server, tool };
}
