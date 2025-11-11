---
summary: 'High-level overview of mcpx’s runtime, entry points, and reusable helpers.'
read_when:
  - 'Onboarding to this repository or explaining mcpx to others'
---

# mcpx Overview

mcpx is the Sweetistics CLI + runtime for the Model Context Protocol (MCP). It wraps the upstream TypeScript SDK with:

- **Runtime orchestration** – `createRuntime` loads servers from config JSON, editor imports, or ad-hoc flags and handles OAuth retries, transport promotion, and cleanup.
- **CLI surfaces** – `mcpx list`, `mcpx call`, `mcpx generate-cli`, `mcpx emit-ts`, and `mcpx inspect-cli` expose the runtime features to humans and scripts.
- **Tooling helpers** – `createServerProxy` maps MCP tools to camelCase methods for Node/Bun scripts and returns `CallResult` helpers (`.text()`, `.markdown()`, `.json()`).

## Primary Commands

- `mcpx list [server|--http-url|--stdio]`
  Lists tool metadata, renders TypeScript-style signatures, and surfaces copy/pasteable examples (including ad-hoc HTTP selectors).
- `mcpx call '{ tool: "server.tool", args: { key: "value" } }'`
  Invokes a tool via data format syntax; add `--output json` to capture structured responses.
- `mcpx generate-cli --server name [--bundle|--compile]`
  Emits a standalone CLI for a single MCP server. Bundling defaults to Rolldown unless the runtime resolves to Bun; compiled binaries require Bun.
- `mcpx emit-ts <server> --mode types|client`
  Produces `.d.ts` files or typed client factories that mirror the CLI schema output.
- `mcpx inspect-cli dist/server.js`
  Reads embedded metadata so you can regenerate a CLI without guesswork.

## Runtime Helpers

Use `createServerProxy(runtime, name)` inside scripts when you want ergonomic camelCase calls instead of kebab-case tool names. The proxy:

1. Validates arguments against the MCP schema.
2. Automatically merges default values.
3. Returns a `CallResult` helper so you can render `.text()`, `.markdown()`, or `.json()` without manual parsing.

When you need raw access (custom transports, streaming), use the bare `Client` from `@modelcontextprotocol/sdk` or inspect `runtime.connect(name)` for lower-level control.

## Debug + Support Docs

- **Ad-hoc MCP Servers** (`docs/adhoc.md`) – explains the `--http-url` / `--stdio` flags.
- **Tool Calling Cheatsheet** (`docs/tool-calling.md`) – shows the two argument styles and when to use each.
- **Hang Diagnostics** (`docs/hang-debug.md` + `docs/tmux.md`) – run long-lived commands inside tmux and dump active handles if shutdown stalls.

Read these docs (via `pnpm run docs:list`) whenever your task touches the corresponding area. They contain the up-to-date guardrails used across Sweetistics repositories.
