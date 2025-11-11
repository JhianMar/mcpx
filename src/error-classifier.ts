import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

export type ErrorKind =
  | "env-missing"
  | "auth"
  | "offline"
  | "dns"
  | "ssl"
  | "rate-limit"
  | "server-overload"
  | "http"
  | "stdio-exit"
  | "validation"
  | "tool-not-found"
  | "config-error"
  | "timeout"
  | "other";

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  context?: {
    server?: string;
    tool?: string;
    envVars?: string[];
    statusCode?: number;
    stdioExitCode?: number;
    stdioSignal?: string;
    suggestion?: string;
  };
}

// Legacy type for backward compatibility
export type ConnectionIssueKind = "auth" | "offline" | "http" | "stdio-exit" | "other";

export interface ConnectionIssue {
  kind: ConnectionIssueKind;
  rawMessage: string;
  statusCode?: number;
  stdioExitCode?: number;
  stdioSignal?: string;
}

const AUTH_STATUSES = new Set([401, 403, 405]);
const DNS_PATTERNS = [
  "enotfound",
  "enodata",
  "getaddrinfo",
  "eai_again",
  "no such host",
  "name or service not known",
  "nodename nor servname provided",
];
const SSL_PATTERNS = [
  "cert_has_expired",
  "certificate has expired",
  "unable_to_verify_leaf_signature",
  "self signed certificate",
  "self-signed certificate",
  "certificate verify failed",
  "ssl certificate problem",
  "ssl handshake failed",
  "err_tls_cert",
  "eproto",
  "wrong version number",
  "tlsv1 alert",
];
const OFFLINE_PATTERNS = [
  "fetch failed",
  "econnrefused",
  "connection refused",
  "connection closed",
  "connection reset",
  "socket hang up",
  "connect timeout",
  "network is unreachable",
  "timed out",
  "timeout",
  "timeout after",
  "enoent",
  "econnaborted",
  "ehostunreach",
  "failed to start",
  "spawn enoent",
];
const HTTP_STATUS_FALLBACK = /\bhttps?:\/\/[^\s]+(?:\s+returned\s+)?(?:status|code)?\s*(\d{3})\b/i;
const STATUS_DIRECT_PATTERN =
  /\b(?:status(?:\s+code)?|http(?:\s+(?:status|code|error))?)[:\s]*(\d{3})\b/i;
const STDIO_EXIT_PATTERN = /exit(?:ed)?(?:\s+with)?(?:\s+(?:code|status))\s+(-?\d+)/i;
const STDIO_SIGNAL_PATTERN = /signal\s+([A-Z0-9]+)/i;
const ENV_VAR_PATTERN = /Environment variable\(s\)\s+([A-Z_][A-Z0-9_,\s]*)\s+must be set/i;
const TOOL_NOT_FOUND_PATTERN = /Tool\s+([^\s]+)\s+not found/i;
const TIMEOUT_PATTERN = /timed? ?out after\s+(\d+)/i;

/**
 * Classify error and return LLM-friendly message
 * This is the primary function for error handling in CLI
 */
export function classifyError(error: unknown): ClassifiedError {
  const rawMessage = extractMessage(error);
  const normalized = rawMessage.toLowerCase();

  // 1. Environment variable missing
  const envMatch = rawMessage.match(ENV_VAR_PATTERN);
  if (envMatch?.[1]) {
    const envVars = envMatch[1]
      .split(/[,\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    return {
      kind: "env-missing",
      message: `Missing environment variable: ${envVars.join(", ")}`,
      context: { envVars, suggestion: `Set ${envVars.join(", ")} and try again` },
    };
  }

  // 2. Tool not found
  const toolMatch = rawMessage.match(TOOL_NOT_FOUND_PATTERN);
  if (toolMatch) {
    return {
      kind: "tool-not-found",
      message: `Tool '${toolMatch[1]}' not found`,
      context: {
        tool: toolMatch[1],
        suggestion: "Run 'mcpx list <server>' to see available tools",
      },
    };
  }

  // 3. Timeout
  const timeoutMatch = rawMessage.match(TIMEOUT_PATTERN);
  if (timeoutMatch || normalized.includes("timeout")) {
    const duration = timeoutMatch?.[1];
    return {
      kind: "timeout",
      message: duration ? `Request timed out after ${duration}ms` : "Request timed out",
      context: { suggestion: "Increase timeout with --timeout or check server status" },
    };
  }

  // 4. Parameter validation
  if (
    rawMessage.includes("Parameter validation failed") ||
    rawMessage.includes("Invalid arguments")
  ) {
    return {
      kind: "validation",
      message: rawMessage,
      context: { suggestion: "Check parameter types and required fields" },
    };
  }

  // 5. Auth errors
  if (error instanceof UnauthorizedError) {
    return {
      kind: "auth",
      message: "Authorization required",
      context: { suggestion: "OAuth will be triggered automatically on first use" },
    };
  }

  const statusCode = extractStatusCode(rawMessage);
  if (AUTH_STATUSES.has(statusCode ?? -1) || containsAuthToken(normalized)) {
    return {
      kind: "auth",
      message: statusCode ? `Authentication failed (HTTP ${statusCode})` : "Authentication failed",
      context: { statusCode, suggestion: "Run this command again to trigger OAuth authentication" },
    };
  }

  // 6. DNS errors
  if (DNS_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      kind: "dns",
      message: "DNS resolution failed - hostname not found",
      context: { suggestion: "Verify server URL and check DNS/network connectivity" },
    };
  }

  // 7. SSL/TLS errors
  if (SSL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    const isExpired = normalized.includes("expired");
    const isSelfSigned = normalized.includes("self signed") || normalized.includes("self-signed");
    let message = "SSL/TLS certificate error";
    let suggestion = "Contact server administrator about certificate issues";

    if (isExpired) {
      message = "SSL certificate has expired";
      suggestion = "Server certificate expired - contact administrator to renew";
    } else if (isSelfSigned) {
      message = "Self-signed SSL certificate";
      suggestion = "Use trusted certificate or configure client to accept self-signed certs";
    }

    return {
      kind: "ssl",
      message,
      context: { suggestion },
    };
  }

  // 8. STDIO exit
  const stdio = extractStdioExit(rawMessage);
  if (stdio) {
    const exit = typeof stdio.stdioExitCode === "number" ? ` (code ${stdio.stdioExitCode})` : "";
    const signal = stdio.stdioSignal ? ` (signal ${stdio.stdioSignal})` : "";
    return {
      kind: "stdio-exit",
      message: `Server process exited${exit}${signal}`,
      context: { ...stdio, suggestion: "Check server logs or configuration" },
    };
  }

  // 9. Rate limiting
  if (statusCode === 429) {
    return {
      kind: "rate-limit",
      message: "Rate limit exceeded (HTTP 429)",
      context: { statusCode, suggestion: "Wait before retrying or upgrade API quota" },
    };
  }

  // 10. Server overload
  if (statusCode === 503) {
    return {
      kind: "server-overload",
      message: "Service unavailable (HTTP 503)",
      context: {
        statusCode,
        suggestion: "Server is overloaded or down for maintenance - retry later",
      },
    };
  }

  // 11. HTTP errors
  if (statusCode && statusCode >= 400) {
    return {
      kind: "http",
      message: `HTTP ${statusCode} error`,
      context: { statusCode, suggestion: "Check server status and configuration" },
    };
  }

  // 12. Offline/network errors
  if (OFFLINE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      kind: "offline",
      message: "Server is offline or unreachable",
      context: { suggestion: "Check network connection and server URL" },
    };
  }

  // 13. Generic error
  return {
    kind: "other",
    message: rawMessage,
  };
}

export function analyzeConnectionError(error: unknown): ConnectionIssue {
  const rawMessage = extractMessage(error);
  if (error instanceof UnauthorizedError) {
    return { kind: "auth", rawMessage };
  }
  const stdio = extractStdioExit(rawMessage);
  if (stdio) {
    return { kind: "stdio-exit", rawMessage, ...stdio };
  }
  const statusCode = extractStatusCode(rawMessage);
  const normalized = rawMessage.toLowerCase();
  if (AUTH_STATUSES.has(statusCode ?? -1) || containsAuthToken(normalized)) {
    return { kind: "auth", rawMessage, statusCode };
  }
  if (statusCode && statusCode >= 400) {
    return { kind: "http", rawMessage, statusCode };
  }
  if (OFFLINE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return { kind: "offline", rawMessage };
  }
  return { kind: "other", rawMessage };
}

export function isAuthIssue(issue: ConnectionIssue): boolean {
  return issue.kind === "auth";
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ?? "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error === undefined || error === null) {
    return "";
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function extractStatusCode(message: string): number | undefined {
  const candidates = [
    message.match(/status code\s*\((\d{3})\)/i)?.[1],
    message.match(STATUS_DIRECT_PATTERN)?.[1],
    message.match(HTTP_STATUS_FALLBACK)?.[1],
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(candidate, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const trimmed = message.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidate = findStatusInObject(parsed);
      if (typeof candidate === "number") {
        return candidate;
      }
      if (typeof candidate === "string") {
        const numeric = Number.parseInt(candidate, 10);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }
    } catch {
      // Expected: message may look like JSON but isn't valid; fall through to undefined
    }
  }
  return undefined;
}

function containsAuthToken(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("401") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("invalid_token") ||
    normalizedMessage.includes("forbidden")
  );
}

function extractStdioExit(
  message: string,
): { stdioExitCode?: number; stdioSignal?: string } | undefined {
  if (!message.toLowerCase().includes("stdio") && !STDIO_EXIT_PATTERN.test(message)) {
    return undefined;
  }
  const exitMatch = message.match(STDIO_EXIT_PATTERN);
  const signalMatch = message.match(STDIO_SIGNAL_PATTERN);
  if (!exitMatch && !signalMatch) {
    return undefined;
  }
  const exitCode = exitMatch ? Number.parseInt(exitMatch[1] ?? "", 10) : undefined;
  return {
    stdioExitCode: Number.isFinite(exitCode) ? exitCode : undefined,
    stdioSignal: signalMatch?.[1],
  };
}

function findStatusInObject(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.status === "number" || typeof record.status === "string") {
    return record.status;
  }
  if (typeof record.code === "number" || typeof record.code === "string") {
    return record.code;
  }
  if (typeof record.error === "object" && record.error !== null) {
    return findStatusInObject(record.error);
  }
  return undefined;
}
