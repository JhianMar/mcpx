import { encode as encodeToToon } from "@toon-format/toon";
import { analyzeConnectionError, type ConnectionIssue } from "@/error-classifier.js";
import { tryParseContent } from "@/cli/content-parser.js";
import { formatErrorForLLM } from "@/cli/error-formatter.js";
import { McpxError } from "@/cli/mcpx-error.js";
import type { IdentifierResolution } from "@/cli/identifier-helpers.js";
import {
  chooseClosestIdentifier,
  normalizeIdentifier,
  renderIdentifierResolutionMessages,
} from "@/cli/identifier-helpers.js";
import { consumeOutputFormat } from "@/cli/output-format.js";
import { readStdin } from "@/cli/stdin-batch.js";
import { dimText, redText, yellowText } from "@/cli/terminal.js";
import { resolveCallTimeout, withTimeout } from "@/cli/timeouts.js";
import { loadToolMetadata } from "@/cli/tool-cache.js";
import { parseCallInput } from "@/cli/call-input-parser.js";
import { normalizeToArray, parseToolString } from "@/cli/format-io.js";
import type { Runtime } from "@/runtime.js";

export async function handleCall(runtime: Runtime, args: string[]): Promise<void> {
  // Check if stdin has input
  const stdinContent = await readStdin();
  if (stdinContent.trim()) {
    await handleInputCall(runtime, stdinContent, args);
    return;
  }

  // Check if first argument is call input (data format or function syntax)
  if (args.length > 0 && looksLikeCallInput(args[0])) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await handleInputCall(runtime, args[0]!, args.slice(1));
    return;
  }

  // Legacy mode: positional arguments (will be removed)
  throw new Error(
    "Invalid call format. Use data format: { tool: 'server.tool', args: {...} } or function syntax: server.tool({ args })",
  );
}

type ToolResolution = IdentifierResolution;

async function invokeWithAutoCorrection(
  runtime: Runtime,
  server: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ result: unknown; resolvedTool: string }> {
  // Attempt the original request first; if it fails with a "tool not found" we opportunistically retry once with a better match.
  return attemptCall(runtime, server, tool, args, timeoutMs, true);
}

async function attemptCall(
  runtime: Runtime,
  server: string,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  allowCorrection: boolean,
): Promise<{ result: unknown; resolvedTool: string }> {
  try {
    const result = await withTimeout(runtime.callTool(server, tool, { args }), timeoutMs);
    return { result, resolvedTool: tool };
  } catch (error) {
    if (error instanceof Error && error.message === "Timeout") {
      const timeoutDisplay = `${timeoutMs}ms`;
      await runtime.close(server).catch((err: Error) => {
        console.error(`Warning: Failed to close runtime after timeout: ${err.message}`);
      });
      throw new Error(
        `Call to ${server}.${tool} timed out after ${timeoutDisplay}. Override MCPX_CALL_TIMEOUT or pass --timeout to adjust.`,
        { cause: error },
      );
    }

    if (!allowCorrection) {
      // Wrap error with context for better reporting at top level
      throw new McpxError(
        error instanceof Error ? error.message : String(error),
        { server, tool },
        { cause: error },
      );
    }

    const resolution = await maybeResolveToolName(runtime, server, tool, error);
    if (!resolution) {
      maybeReportConnectionIssue(server, tool, error);
      throw new McpxError(
        error instanceof Error ? error.message : String(error),
        { server, tool },
        { cause: error },
      );
    }

    const messages = renderIdentifierResolutionMessages({
      entity: "tool",
      attempted: tool,
      resolution,
      scope: server,
    });
    if (resolution.kind === "suggest") {
      if (messages.suggest) {
        console.error(dimText(messages.suggest));
      }
      throw error;
    }
    if (messages.auto) {
      console.log(dimText(messages.auto));
    }
    return attemptCall(runtime, server, resolution.value, args, timeoutMs, false);
  }
}

async function maybeResolveToolName(
  runtime: Runtime,
  server: string,
  attemptedTool: string,
  error: unknown,
): Promise<ToolResolution | undefined> {
  const missingName = extractMissingToolFromError(error);
  if (!missingName) {
    return undefined;
  }

  // Only attempt a suggestion if the server explicitly rejected the tool we tried.
  if (normalizeIdentifier(missingName) !== normalizeIdentifier(attemptedTool)) {
    return undefined;
  }

  const tools = await loadToolMetadata(runtime, server).catch((err: Error) => {
    // Tool metadata loading is best-effort for autocorrection; log but continue
    console.error(`Warning: Could not load tool metadata for autocorrection: ${err.message}`);
    return undefined;
  });
  if (!tools) {
    return undefined;
  }

  const resolution = chooseClosestIdentifier(
    attemptedTool,
    tools.map((entry) => entry.tool.name),
  );
  if (!resolution) {
    return undefined;
  }
  return resolution;
}

function extractMissingToolFromError(error: unknown): string | undefined {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  if (!message) {
    return undefined;
  }
  const match = message.match(/Tool\s+([A-Za-z0-9._-]+)\s+not found/i);
  return match?.[1];
}

function maybeReportConnectionIssue(
  server: string,
  tool: string,
  error: unknown,
): ConnectionIssue | undefined {
  const issue = analyzeConnectionError(error);
  const detail = summarizeIssueMessage(issue.rawMessage);
  if (issue.kind === "auth") {
    const hint = `[mcpx] OAuth required for ${server}. Run this command again to trigger authentication.${detail ? ` (${detail})` : ""}`;
    console.error(yellowText(hint));
    return issue;
  }
  if (issue.kind === "offline") {
    const hint = `[mcpx] ${server} appears offline${detail ? ` (${detail})` : ""}.`;
    console.error(redText(hint));
    return issue;
  }
  if (issue.kind === "http") {
    const status = issue.statusCode ? `HTTP ${issue.statusCode}` : "an HTTP error";
    const hint = `[mcpx] ${server}.${tool} responded with ${status}${detail ? ` (${detail})` : ""}.`;
    console.error(dimText(hint));
    return issue;
  }
  if (issue.kind === "stdio-exit") {
    const exit =
      typeof issue.stdioExitCode === "number" ? `code ${issue.stdioExitCode}` : "an unknown status";
    const signal = issue.stdioSignal ? ` (signal ${issue.stdioSignal})` : "";
    const hint = `[mcpx] STDIO server for ${server} exited with ${exit}${signal}.`;
    console.error(redText(hint));
  }
  return issue;
}

function summarizeIssueMessage(message: string): string {
  if (!message) {
    return "";
  }
  const trimmed = message.trim();
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}…`;
}

/**
 * Check if input looks like call input (data format or function syntax)
 */
function looksLikeCallInput(input: string | undefined): boolean {
  if (!input) {
    return false;
  }
  const trimmed = input.trim();

  // Data format: starts with { or [
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return true;
  }

  // Function syntax: server.tool(...)
  if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\s*\(/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Handle call with input (data format or function syntax)
 * Unified handler for both stdin and direct input
 */
async function handleInputCall(
  runtime: Runtime,
  input: string,
  remainingArgs: string[],
): Promise<void> {
  // Parse input (auto-detects format)
  let callData;
  try {
    callData = parseCallInput(input);
  } catch (error) {
    throw new Error(`Failed to parse call input: ${(error as Error).message}`, {
      cause: error,
    });
  }

  // Normalize to array format
  const calls = normalizeToArray(callData);

  // Single call - throw errors directly
  if (calls.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = calls[0]!;
    const { server, tool } = parseToolString(call.tool);
    const callArgs = call.args ?? {};

    // Get output format and timeout from remaining args
    const outputFormat = consumeOutputFormat(remainingArgs, { defaultFormat: "toon" });

    // Extract timeout from args
    let timeoutMs: number | undefined;
    const timeoutIndex = remainingArgs.indexOf("--timeout");
    if (timeoutIndex !== -1 && remainingArgs[timeoutIndex + 1]) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      timeoutMs = Number.parseInt(remainingArgs[timeoutIndex + 1]!, 10);
    }
    timeoutMs = resolveCallTimeout(timeoutMs);

    const invocation = await invokeWithAutoCorrection(runtime, server, tool, callArgs, timeoutMs);

    const parsed = tryParseContent(invocation.result);
    const results = [{ tool: call.tool, output: parsed }];

    outputCallResults(results, outputFormat);
    return;
  }

  // Batch calls - collect errors
  const outputFormat = consumeOutputFormat(remainingArgs, { defaultFormat: "toon" });
  const results: Array<{ tool: string; output: unknown }> = [];
  let hasErrors = false;

  for (const call of calls) {
    const { server, tool } = parseToolString(call.tool);
    const callArgs = call.args ?? {};

    try {
      const timeoutMs = resolveCallTimeout(undefined);
      const invocation = await invokeWithAutoCorrection(runtime, server, tool, callArgs, timeoutMs);

      const parsed = tryParseContent(invocation.result);

      results.push({
        tool: call.tool,
        output: parsed,
      });
    } catch (error) {
      hasErrors = true;
      const errorMessage = formatErrorForLLM(error);

      results.push({
        tool: call.tool,
        output: errorMessage,
      });
    }
  }

  // Output results
  outputCallResults(results, outputFormat);

  if (hasErrors) {
    process.exitCode = 1;
  }
}

/**
 * Output call results in specified format
 */
function outputCallResults(
  results: Array<{ tool: string; output: unknown }>,
  format: Awaited<ReturnType<(typeof import("@/cli/output-format.js"))["consumeOutputFormat"]>>,
): void {
  if (format === "raw") {
    // Raw format: output each result's raw content
    for (const result of results) {
      console.log(result.output);
    }
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Default to TOON format
  try {
    const toonOutput = encodeToToon(results);
    console.log(toonOutput);
  } catch {
    // Expected: TOON encoding may fail for complex data structures; fall back to JSON
    console.log(JSON.stringify(results, null, 2));
  }
}
