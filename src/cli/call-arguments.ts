import type { EphemeralServerSpec } from "@/cli/adhoc-server.js";
import { extractEphemeralServerFlags } from "@/cli/ephemeral-flags.js";
import { consumeOutputFormat } from "@/cli/output-format.js";
import type { OutputFormat } from "@/cli/output-utils.js";
import { consumeTimeoutFlag } from "@/cli/timeouts.js";

export interface CallArgsParseResult {
  selector?: string;
  server?: string;
  tool?: string;
  args: Record<string, unknown>;
  positionalArgs?: unknown[];
  tailLog: boolean;
  output: OutputFormat;
  timeoutMs?: number;
  ephemeral?: EphemeralServerSpec;
}

export function parseCallArguments(args: string[]): CallArgsParseResult {
  const result: CallArgsParseResult = {
    args: {},
    tailLog: false,
    output: "toon",
  };
  const ephemeral = extractEphemeralServerFlags(args);
  result.ephemeral = ephemeral;
  result.output = consumeOutputFormat(args, {
    defaultFormat: "toon",
  });
  const positional: string[] = [];
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (!token) {
      index += 1;
      continue;
    }
    if (token === "--server" || token === "--mcp") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`Flag '${token}' requires a value.`);
      }
      result.server = value;
      index += 2;
      continue;
    }
    if (token === "--tool") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`Flag '${token}' requires a value.`);
      }
      result.tool = value;
      index += 2;
      continue;
    }
    if (token === "--timeout") {
      result.timeoutMs = consumeTimeoutFlag(args, index, {
        flagName: "--timeout",
        missingValueMessage: "--timeout requires a value (milliseconds).",
      });
      continue;
    }
    if (token === "--tail-log") {
      result.tailLog = true;
      index += 1;
      continue;
    }
    if (token === "--yes") {
      index += 1;
      continue;
    }
    if (token === "--args") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--args requires a JSON value.");
      }
      try {
        const decoded = JSON.parse(value);
        if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
          throw new Error("--args must be a JSON object.");
        }
        Object.assign(result.args, decoded);
      } catch (error) {
        throw new Error(`Unable to parse --args: ${(error as Error).message}`, {
          cause: error,
        });
      }
      index += 2;
      continue;
    }
    positional.push(token);
    index += 1;
  }

  // Extract selector (server name or URL)
  if (!result.selector && positional.length > 0 && !result.server) {
    result.selector = positional.shift();
  }

  // Extract tool name
  if (!result.tool && positional.length > 0) {
    result.tool = positional.shift();
  }

  // All remaining positional tokens are treated as positional arguments
  if (positional.length > 0) {
    result.positionalArgs = [...(result.positionalArgs ?? []), ...positional];
  }
  return result;
}
