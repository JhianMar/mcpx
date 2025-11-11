# Proxy Command Proposal

## Problem Statement

Many MCP servers use stdio transport and maintain internal state (browser sessions, database connections, cached data). Currently, each `mcpx call` spawns a new stdio process, making stateful interactions impossible:

```bash
# Each call spawns fresh process → state is lost
mcpx call '{ tool: "browser.openBrowser" }'           # spawn → open browser → exit
mcpx call '{ tool: "browser.navigateTo", args: { url: "..." } }'  # spawn again → browser session lost ❌
```

Users need a way to expose stdio MCP servers as persistent HTTP endpoints.

## Solution

Add `mcpx proxy` command to bridge stdio MCP servers to HTTP transport:

```bash
# Start persistent proxy
mcpx proxy --port 8080 bun run browser-mcp-server

# Call through HTTP - same browser session
mcpx call --http-url http://localhost:8080 '{ tool: "browser.openBrowser" }'
mcpx call --http-url http://localhost:8080 '{ tool: "browser.navigateTo", args: { url: "..." } }'  # ✅ Works
```

## Use Cases

1. **Stateful MCP servers**: Browser automation, database connections, file watchers
2. **Remote access**: Expose local stdio servers to remote clients
3. **LLM integration**: Provide stable HTTP endpoint for LLM tools
4. **Development**: Test MCP clients against local servers without stdio complexity

## Non-goals

- Multi-server routing (like mcp-proxy's named servers)
- OAuth/authentication layers
- Load balancing or scaling
- Reverse proxy features

Keep it simple: one stdio server → one HTTP endpoint.

## API Design

### Command Signature

```bash
mcpx proxy [OPTIONS] COMMAND [ARGS...]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--port` | number | random | Port to listen on |
| `--host` | string | `127.0.0.1` | Host to bind to |
| `--transport` | `sse` \| `streamablehttp` | `streamablehttp` | HTTP transport type |
| `--allow-origin` | string[] | `[]` | CORS allowed origins (can be repeated) |

### Examples

```bash
# Basic usage
mcpx proxy bun run browser-server.ts

# Custom port
mcpx proxy --port 8080 npx @modelcontextprotocol/server-puppeteer

# Allow CORS for remote access
mcpx proxy --port 3000 --allow-origin '*' bun run ./server.ts

# Pass environment variables
mcpx proxy --port 8080 -- bun run server.ts --verbose
```

## Architecture

```
┌──────────────────────────────────────┐
│  mcpx proxy (Hono HTTP Server)       │
│  ┌─────────────────────────────────┐ │
│  │ StreamableHTTPServerTransport   │ │  ← Hono handles HTTP
│  │            ↓                     │ │
│  │      MCP Server (proxy)         │ │  ← SDK Server
│  │            ↓                     │ │
│  │   StdioClientTransport          │ │  ← Connect to stdio
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
              ↓ stdio (persistent)
┌──────────────────────────┐
│  browser-mcp-server      │  ← User's MCP server
│  (keeps state)           │
└──────────────────────────┘
```

### Flow

1. **Startup**:
   - Spawn stdio server process (keep alive)
   - Create MCP client connected to stdio
   - Create MCP server that proxies to client
   - Wrap server in StreamableHTTP transport
   - Start Hono server with transport handler

2. **Request handling**:
   - HTTP request → Hono → StreamableHTTPServerTransport
   - Transport → MCP Server → MCP Client → stdio process
   - Response flows back through same chain

3. **Shutdown**:
   - Close HTTP server
   - Close MCP client/server
   - Terminate stdio process

## Technical Stack

### Dependencies

- **hono**: `^4.x` - HTTP framework
- **@modelcontextprotocol/sdk**: Already installed
  - `Server` - Create MCP server
  - `StdioClientTransport` - Connect to stdio
  - `StreamableHTTPServerTransport` - HTTP transport

### Why Hono?

- **Mature**: Battle-tested, widely adopted
- **Fast**: Optimized for Bun runtime
- **Simple**: Minimal API surface
- **Compatible**: Drop-in for Bun.serve if needed

Bun's built-in HTTP server is similar, but Hono provides:
- Better routing and middleware support
- CORS handling
- Error handling patterns
- Future extensibility (logging, metrics)

## Implementation Plan

### Phase 1: Core Functionality (~200 LOC)

File: `src/cli/proxy-command.ts`

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamablehttp.js'

export async function handleProxy(args: string[]): Promise<void> {
  // 1. Parse arguments
  const { port, host, transport, allowOrigin, command, commandArgs } = parseProxyArgs(args)

  // 2. Spawn stdio server (persistent)
  const stdioProcess = spawnStdioServer(command, commandArgs)

  // 3. Create MCP client → server proxy
  const client = await createStdioClient(stdioProcess)
  const server = await createProxyServer(client)

  // 4. Setup Hono with StreamableHTTP transport
  const app = new Hono()
  if (allowOrigin.length > 0) {
    app.use('*', cors({ origin: allowOrigin }))
  }

  const httpTransport = new StreamableHTTPServerTransport('/mcp', server)
  app.all('/mcp/*', async (c) => {
    return await httpTransport.handle(c.req.raw)
  })

  // 5. Start server
  console.log(`Proxy listening on http://${host}:${port}`)
  Bun.serve({ port, hostname: host, fetch: app.fetch })

  // 6. Cleanup on exit
  process.on('SIGINT', () => cleanup(stdioProcess, server))
}
```

### Phase 2: CLI Integration

1. Add to `src/cli.ts`:
   ```typescript
   if (command === 'proxy') {
     const { handleProxy } = await import('@/cli/proxy-command.js')
     await handleProxy(args)
     return
   }
   ```

2. Update help text in `src/cli.ts`:
   ```
   mcpx proxy [OPTIONS] COMMAND [ARGS...]
     --port PORT          Port to listen on (default: random)
     --host HOST          Host to bind (default: 127.0.0.1)
     --transport TYPE     sse | streamablehttp (default: streamablehttp)
     --allow-origin ORIGIN  CORS origin (repeatable)
   ```

### Phase 3: Testing

Create `tests/proxy-command.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { spawn } from 'child_process'

test('proxy starts and responds to HTTP', async () => {
  // 1. Start proxy with echo server
  const proxy = spawn('bun', ['run', 'src/cli.ts', 'proxy', '--port', '8888', 'bun', 'run', 'tests/fixtures/echo-server.ts'])

  // 2. Wait for startup
  await new Promise(resolve => setTimeout(resolve, 1000))

  // 3. Call through HTTP
  const response = await fetch('http://localhost:8888/mcp/initialize', {
    method: 'POST',
    body: JSON.stringify({ /* MCP init */ })
  })

  expect(response.ok).toBe(true)

  // 4. Cleanup
  proxy.kill()
})
```

## Error Handling

### Stdio Process Crashes

```typescript
stdioProcess.on('exit', (code) => {
  console.error(`Stdio server exited with code ${code}`)
  console.error('Proxy shutting down...')
  process.exit(1)
})
```

### Port Already in Use

```typescript
try {
  Bun.serve({ port, hostname: host, fetch: app.fetch })
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} already in use`)
    process.exit(1)
  }
  throw error
}
```

### MCP Client Connection Failure

```typescript
try {
  await client.initialize()
} catch (error) {
  console.error('Failed to connect to stdio server:', error.message)
  stdioProcess.kill()
  process.exit(1)
}
```

## Future Enhancements (Out of Scope)

### V2: Health Checks
```bash
mcpx proxy --port 8080 --health-path /health bun run server.ts
```

### V3: Metrics
```bash
mcpx proxy --port 8080 --metrics-path /metrics bun run server.ts
# Exposes request counts, latency, error rates
```

### V4: Process Management
```bash
mcpx proxy --port 8080 --restart-on-crash bun run server.ts
# Auto-restart stdio process if it crashes
```

## Security Considerations

1. **Default binding**: `127.0.0.1` prevents external access by default
2. **CORS**: Disabled by default, explicit opt-in with `--allow-origin`
3. **No authentication**: Users should use reverse proxy (nginx, Caddy) if needed
4. **Stdio isolation**: Process runs with same permissions as proxy

## Documentation Updates

### README.md

Add section under "Commands":

```markdown
### Proxy: Expose stdio servers as HTTP

Turn local stdio MCP servers into persistent HTTP endpoints:

\`\`\`bash
# Start proxy
mcpx proxy --port 8080 bun run browser-server.ts

# Call through HTTP
mcpx call --http-url http://localhost:8080 '{ tool: "browser.openBrowser" }'
\`\`\`

Perfect for stateful servers (browser automation, databases) and remote access.
```

### New File: docs/proxy.md

Detailed guide with:
- Use cases and examples
- Comparison with direct stdio calls
- Integration with LLM tools
- Troubleshooting guide

## Open Questions

1. **Transport default**: Should we default to `streamablehttp` or `sse`?
   - **Recommendation**: `streamablehttp` (more modern, stateless by default)

2. **Process lifecycle**: Should we support `--restart-on-crash`?
   - **Recommendation**: Not in V1, let user handle with systemd/supervisor

3. **Logging**: Should proxy log MCP requests?
   - **Recommendation**: Add `--verbose` flag for debug logging

4. **Signal handling**: How to handle SIGTERM vs SIGINT?
   - **Recommendation**: Both trigger graceful shutdown (close HTTP, kill stdio, exit)

## Alternatives Considered

### Alternative 1: Use existing mcp-proxy Python tool

**Pros**:
- Already implemented
- Well-tested
- Supports multiple servers

**Cons**:
- Python dependency (mcpx is pure TypeScript/Bun)
- Extra installation step
- Different CLI interface
- Harder to integrate with mcpx workflows

**Decision**: Implement natively in mcpx for better UX

### Alternative 2: Use Bun.serve directly (no Hono)

**Pros**:
- No extra dependency
- Slightly smaller bundle

**Cons**:
- Manual CORS handling
- Manual routing
- Less maintainable
- Harder to extend (metrics, auth)

**Decision**: Use Hono for better DX and future extensibility

## Success Metrics

1. **Code size**: < 250 LOC for core implementation
2. **Startup time**: < 500ms for proxy to be ready
3. **Overhead**: < 10ms latency added vs direct stdio
4. **Reliability**: Proxy should not crash if stdio server crashes (graceful shutdown)

## Timeline

- **Day 1**: Implement core proxy command (~4 hours)
- **Day 2**: Add tests and error handling (~2 hours)
- **Day 3**: Update docs and README (~1 hour)
- **Day 4**: Manual testing with real MCP servers (~2 hours)

**Total**: ~2-3 days of focused work

## Approval Checklist

- [ ] API design reviewed
- [ ] Architecture approved
- [ ] Dependencies acceptable (hono)
- [ ] Error handling strategy agreed
- [ ] Documentation plan confirmed
- [ ] Testing approach validated

---

**Status**: Draft
**Author**: Claude
**Date**: 2025-11-09
**Target Version**: v0.6.0
