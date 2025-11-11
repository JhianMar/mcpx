# Error Messages for LLM Agents

This document shows how MCPX error messages are designed to be concise and actionable for LLM agents.

## Design Principles

1. **Concise**: No stack traces by default (use `MCPX_DEBUG=1` for debugging)
2. **Contextual**: Include server and tool names when relevant
3. **Actionable**: Provide clear next steps for the user
4. **Structured**: Consistent `[mcpx] server.tool: message suggestion` format

## Error Examples

### Environment Variable Missing

**Before:**
```
[mcpx] Failed to resolve header 'Authorization' for server 'linear': Environment variable(s) LINEAR_API_KEY must be set for MCP header substitution.
13 |   for (const [key, value] of Object.entries(headers)) {
14 |     try {
15 |       resolved[key] = resolveEnvPlaceholders(value);
... (50+ lines of stack trace)
```

**After:**
```
[mcpx] linear.create_comment: Missing environment variable: LINEAR_API_KEY Set LINEAR_API_KEY and try again
```

### Tool Not Found

**Before:**
```
MCP error -32602: Tool listIssues not found
  at attemptCall (src/cli/call-command.ts:75:13)
  at invokeWithAutoCorrection (src/cli/call-command.ts:50:11)
... (stack trace)
```

**After:**
```
[mcpx] Did you mean linear.list_issues?
[mcpx] Tool 'listIssues' not found Run 'mcpx list <server>' to see available tools
```

### Authentication Required

**Before:**
```
SSE error: Non-200 status code (401)
  at StreamableHTTPClientTransport (...)
... (stack trace)
```

**After:**
```
[mcpx] vercel: Authentication failed (HTTP 401) OAuth flow will be triggered automatically on retry
```

### Timeout

**Before:**
```
Call to linear.list_issues timed out after 30000ms. Override MCPX_CALL_TIMEOUT or pass --timeout to adjust.
Error: Timeout
  at withTimeout (src/cli/timeouts.ts:15:11)
... (stack trace)
```

**After:**
```
[mcpx] linear.list_issues: Request timed out after 30000ms Increase timeout with --timeout or check server status
```

### Server Offline

**Before:**
```
fetch failed: ECONNREFUSED connection refused
  at fetch (...)
... (stack trace)
```

**After:**
```
[mcpx] github: Server is offline or unreachable Check network connection and server URL
```

## Debug Mode

For debugging and development, set `MCPX_DEBUG=1` to see full stack traces:

```bash
MCPX_DEBUG=1 mcpx call 'linear.create_issue(...)'
```

Output with debug mode:
```
[mcpx] linear.create_issue: Missing environment variable: LINEAR_API_KEY Set LINEAR_API_KEY and try again

[DEBUG] Full error:
Error: Environment variable(s) LINEAR_API_KEY must be set for MCP header substitution.
  at resolveEnvPlaceholders (src/env.ts:72:15)
  at resolveHeaders (src/runtime-header-utils.ts:15:23)
  ... (full stack trace)
```

## Error Classification

MCPX classifies errors into the following categories:

- `env-missing`: Missing environment variables
- `auth`: Authentication/authorization failures
- `offline`: Network/connection issues
- `http`: HTTP errors (4xx, 5xx)
- `stdio-exit`: Subprocess failures
- `validation`: Parameter validation failures
- `tool-not-found`: Tool doesn't exist
- `timeout`: Request timeouts
- `other`: Uncategorized errors

## Implementation

See:
- `src/error-classifier.ts` - Error classification logic
- `src/cli/error-reporter.ts` - LLM-friendly message formatting
- `tests/error-reporter.test.ts` - Test coverage for all error types
