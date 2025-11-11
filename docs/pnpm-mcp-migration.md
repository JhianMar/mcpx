---
summary: 'Mapping from the legacy `pnpm mcp:*` scripts to the modern mcpx CLI.'
read_when:
  - 'Helping teammates migrate old pnpm workflows to mcpx'
---

# Migrating from `pnpm mcp:*`

The legacy `pnpm mcp:*` helpers map directly onto the `mcpx` CLI.

- `pnpm mcpx:list` → `mcpx list`
- `pnpm mcpx:call server.tool key=value` → `mcpx call '{ tool: "server.tool", args: { key: "value" } }'`
- New flag: `--tail-log` follows log output referenced by responses.

For a step-by-step checklist (including config updates and environment variables) see [`docs/migration.md`](./migration.md).
