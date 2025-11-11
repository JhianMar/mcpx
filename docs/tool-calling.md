---
summary: 'Cheatsheet for mcpx call data format and best practices.'
read_when:
  - 'Designing or debugging tool invocation UX'
---

# Tool Calling Cheatsheet

mcpx uses structured data formats (JSON5/JSON/YAML/TOML) for tool invocation. All calls feed the same validation pipeline (schema-driven type coercion, required-field checks, enum hints).

## Data Format Syntax

```bash
# Single call
mcpx call '{ tool: "linear.create_issue", args: { title: "Bug", team: "ENG" } }'

# Batch calls
mcpx call '[
  { tool: "linear.list_issues", args: { team: "ENG" } },
  { tool: "github.search_repos", args: { query: "mcp" } }
]'

# From stdin
echo '{ tool: "linear.list_issues", args: { limit: 5 } }' | mcpx call
```

**Why data format?**
- Semantic clarity: it's data, not code
- Batch-friendly: single and batch calls use same syntax
- LLM-friendly: no parsing quirks, unambiguous structure
- Format-agnostic: JSON5, YAML, TOML all supported

## Server/Tool Selection

```bash
# Explicit server.tool in tool name
mcpx call '{ tool: "linear.create_issue", args: { title: "Bug" } }'

# Or use flags
mcpx call --server linear --tool create_issue --args '{ "title": "Bug" }'
```

## Ad-hoc Servers

```bash
# Direct URL in tool name
mcpx call '{ tool: "https://mcp.deepwiki.com/sse.ask_question", args: { repoName: "value", question: "What is new?" } }'

# Or use --http-url flag
mcpx call --http-url https://mcp.example.com/mcp '{ tool: "fetch_docs", args: { repoName: "value" } }'

# stdio servers
mcpx call --stdio "bun run ./server.ts" '{ tool: "analyze", args: { code: "..." } }'
```

Bare URLs trigger ad-hoc server registration. Combine with `--stdio`, `--env`, `--cwd` for local transports.

## Output Modes

```bash
# TOON (default) - compact, LLM-friendly
mcpx call '{ tool: "linear.list_issues", args: {} }'

# JSON - structured output
mcpx call '{ tool: "linear.list_issues", args: {} }' --output json

# Text - plain text extraction
mcpx call '{ tool: "linear.list_issues", args: {} }' --output text
```

---

**Tips**
- Use `mcpx list <server>` to see type specs showing exact data structure
- Copy type specs directly into your calls - they match the data format
- For batch processing, use arrays for consistent multi-call syntax
- OAuth authentication is triggered automatically when servers require it
