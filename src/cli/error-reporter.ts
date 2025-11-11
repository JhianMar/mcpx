/**
 * Unified error reporter for CLI
 * Outputs LLM-friendly messages to stderr without stack traces (unless debug mode)
 */

import { classifyError } from "@/error-classifier.js";
import { McpxError } from "@/cli/mcpx-error.js";
import { redText, yellowText } from "@/cli/terminal.js";

const DEBUG = process.env.MCPX_DEBUG === "1";

/**
 * Report error to user with LLM-friendly message
 * Returns formatted message for testing
 */
export function reportError(error: unknown, context?: { server?: string; tool?: string }): string {
  const classified = classifyError(error);

  // Extract context from McpxError or use provided context
  let effectiveContext = context;
  if (error instanceof McpxError && error.context) {
    effectiveContext = { ...error.context, ...context };
  }

  // Enhance context with server/tool if provided
  if (effectiveContext?.server) {
    classified.context = { ...classified.context, server: effectiveContext.server };
  }
  if (effectiveContext?.tool) {
    classified.context = { ...classified.context, tool: effectiveContext.tool };
  }

  const message = formatErrorMessage(classified);

  // Output to stderr
  if (classified.kind === "env-missing" || classified.kind === "auth") {
    console.error(yellowText(message));
  } else {
    console.error(redText(message));
  }

  // In debug mode, also print the full error
  if (DEBUG && error instanceof Error && error.stack) {
    console.error(redText("\n[DEBUG] Full error:"));
    console.error(error.stack);
  }

  return message;
}

/**
 * Format classified error into LLM-friendly message
 */
function formatErrorMessage(classified: ReturnType<typeof classifyError>): string {
  const { message, context } = classified;

  // Build prefix with server/tool context
  const parts: string[] = ["[mcpx]"];

  // Extract tool name from message if present (e.g., "Tool 'foo' not found")
  const toolInMessage = message.match(/Tool ['"']([^'"']+)['"']/)?.[1];
  const effectiveTool = context?.tool || toolInMessage;

  if (context?.server && effectiveTool) {
    parts.push(`${context.server}.${effectiveTool}:`);
  } else if (context?.server) {
    parts.push(`${context.server}:`);
  }

  // Add main message
  parts.push(message);

  // Add suggestion for actionable errors
  if (context?.suggestion) {
    return `${parts.join(" ")} ${context.suggestion}`;
  }

  return parts.join(" ");
}

/**
 * Report error and exit with code 1
 */
export function reportErrorAndExit(
  error: unknown,
  context?: { server?: string; tool?: string },
): never {
  reportError(error, context);
  process.exit(1);
}
