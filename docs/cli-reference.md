---
summary: 'Quick reference for mcpx subcommands, their arguments, and shared global flags.'
read_when:
  - 'Need a refresher on available CLI commands'
---

# mcpx CLI Reference

A quick reference for the primary `mcpx` subcommands. Each command inherits
`--config <file>` and `--root <dir>` to override where servers are loaded from.

## `mcpx list [server]`
- Without arguments, lists every configured server (with live discovery + brief
  status).
- With a server name, prints TypeScript-style signatures for each tool, doc
  comments, and optional summaries (Spec format).
- Flags:
  - `--timeout <ms>` – per-server timeout when enumerating all servers.

## `mcpx call <server.tool>`
- Invokes a tool once and prints the response; supports function-call syntax with
  named and positional arguments.
- Useful flags:
  - `--server`, `--tool` – alternate way to target a tool.
  - `--timeout <ms>` – override call timeout (defaults to `CALL_TIMEOUT_MS`).
  - `--output text|json|raw` – choose how to render the `CallResult`.
  - `--tail-log` – stream tail output when the tool returns log handles.

## `mcpx generate-cli`
- Produces a standalone CLI for a single MCP server (optionally bundling or
  compiling with Bun).
- Key flags:
  - `--server <name>` (or inline JSON) – choose the server definition.
  - `--command <url|command>` – point at an ad-hoc HTTP endpoint (include `https://` or use `host/path.tool`) or a stdio command (anything with spaces, e.g., `"bunx chrome-devtools-mcp@latest"`). If you omit `--command`, the first positional argument is inspected: whitespace → stdio, otherwise the parser probes for HTTP/HTTPS and falls back to config names.
  - `--output <path>` – where to write the TypeScript template.
  - `--bundle <path>` – emit a bundle (Node/Bun) ready for `bun x`.
  - `--bundler rolldown|bun` – pick the bundler implementation (defaults to Rolldown unless the runtime resolves to Bun, in which case Bun’s bundler is used automatically; still requires a local Bun install).
  - `--compile <path>` – compile with Bun (implies `--runtime bun`).
  - `--timeout <ms>` / `--runtime node|bun` – shared via the generator flag
    parser so defaults stay consistent.
  - `--from <artifact>` – reuse metadata from an existing CLI artifact (legacy
    `regenerate-cli` behavior, must point at an existing CLI).
  - `--dry-run` – print the resolved `mcpx generate-cli ...` command without
    executing (requires `--from`).
  - Positional shorthand: `mcpx generate-cli linear` uses the configured
    `linear` definition; `mcpx generate-cli https://example.com/mcp`
    treats the URL as an ad-hoc server definition.

## `mcpx emit-ts <server>`
- Emits TypeScript definitions (and optionally a ready-to-use client) describing
  a server's tools. This reuses the same formatter as `mcpx list` so doc
  comments, signatures, and examples stay in sync.
- Modes:
  - `--mode types --out <file.d.ts>` (default) – export an interface whose
    methods return `Promise<CallResult>`, with doc comments and optional
    summaries.
  - `--mode client --out <file.ts>` – emit both the interface (`<file>.d.ts`)
    and a factory that wraps `createServerProxy`, returning objects whose
    methods resolve to `CallResult`.
- Other flags:
  - `--types-out <file>` – override where the `.d.ts` sits when using client
    mode.

For more detail (behavioral nuances, OAuth flows, etc.), see `docs/spec.md` and
command-specific docs under `docs/`.
