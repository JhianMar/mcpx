---
summary: 'How to use mcpx’s ad-hoc HTTP/stdio flags to try MCP servers without editing config files.'
read_when:
  - 'Exploring or debugging unknown MCP endpoints'
---

# Ad-hoc MCP Servers

mcpx is gaining support for "just try it" workflows where you point the CLI at a raw MCP endpoint without first editing a config file. This doc tracks the behavior and heuristics we use to make that experience smooth while keeping the runtime predictable.

## Entry Points

Two new flag sets let you describe a server on the command line:

- `mcpx list --http-url https://mcp.linear.app/mcp [--name linear]`
- `mcpx call --stdio "bun run ./server.ts" --name local-tools`

You can also pass a bare URL as the selector (`mcpx list https://mcp.linear.app/mcp`) or use it directly in call data format (`mcpx call '{ tool: "https://mcp.example.com/tools.generate", args: { topic: "release" } }'`).
- Use `--output json` with `mcpx list` when you need a machine-readable summary of status counts and per-server failures, `--output json`/`--output raw` with `mcpx call` to receive structured `{ server, tool, issue }` envelopes whenever a transport error occurs.

### Example: HTTP ad-hoc workflow

```bash
# Inspect the server directly via URL (no config entry needed)
mcpx list 'https://mcp.sentry.dev/mcp?agent=1'

# Call a tool using data format
mcpx call '{ tool: "https://mcp.sentry.dev/mcp?agent=1.use_sentry", args: { request: "yo whats up" } }'
```

Notice that the second command repeats the URL. Ad-hoc definitions are ephemeral unless you pass `--persist`, so there is no stored server named `mcp-sentry-dev-mcp` yet. Reusing the printed slug only works after you persist the definition (see "Naming & Identity" below) or add the server to your config; otherwise keep passing the URL/stdio selector each time.

## Transport Detection

- **HTTP(S)**: Providing a URL defaults to the streamable HTTP transport. `https://` works out of the box; `http://` requires `--allow-http` to acknowledge cleartext traffic.
- **STDIO**: Supplying `--stdio` (with a command string) or `--stdio-bin` (binary + args) selects the stdio transport. We accept optional `--cwd` and `--env KEY=value` pairs.
- **Conflict guard**: Passing both URL and stdio flags errors out so we don’t guess.

## Naming & Identity

- `--name` wins when provided.
- Otherwise we derive a slug:
  - HTTP: `<host>` plus a sanitized path fragment (e.g. `mcp-linear-app-mcp`).
  - STDIO: executable basename + script (`node-singlestep`).
- Until you persist the definition (via `--persist`, `mcpx config add`, etc.), the slug is **only** used as the cache key for OAuth tokens/log prefs—you still need to supply the ad-hoc descriptor (`--http-url`, `--stdio`, or bare URL) every time you invoke `mcpx list|call`.
- Once persisted, the slug becomes a normal server name so `mcpx call <slug>.tool` and `mcpx list <slug>` work just like any other configured entry.

This name becomes the cache key for OAuth tokens and log preferences, so repeated ad-hoc calls still benefit from credential reuse.

## OAuth Auto-Detection

Many hosted MCP servers (Supabase, Vercel, etc.) advertise OAuth capabilities but expect clients to discover this dynamically. When an ad-hoc HTTP server responds with `401/403` during the initial handshake, mcpx automatically:

1. **Promotes the definition to OAuth** and spins up the default browser flow—no need to edit config or supply `auth: "oauth"` manually.
2. **Persists the change** whenever you pass `--persist`, so future runs remember that the endpoint requires OAuth without repeating the detection step.

OAuth is triggered automatically on first use when a server requires authentication.

## Persistence

- OAuth flows are handled automatically; successful tokens store under the inferred name just like regular definitions.
- Nothing is written to disk unless you pass `--persist /path/to/config.json`. When set, we merge the generated definition into that file (creating it if necessary) so future runs can rely on the standard config pipeline.

## Safety Nets

- Non-HTTPS endpoints require `--allow-http`.
- For stdio commands we print a confirmation snippet the first time we see a new command unless `--yes` is present.
- Missing transports or malformed combinations throw descriptive errors, pointing to `docs/adhoc.md` for guidance.

## Follow-ups

- Extend `mcpx config add` to leverage the same helper, making it the one-stop path from exploration to permanence.
- Consider caching inference results so repeated URL calls automatically rehydrate the previous settings (env/cwd).
