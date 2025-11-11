# Session Notes

Important patterns and anti-patterns that should inform future work.

## Critical: homebrew-mcpx is a Generated Artifact Repo

**The mistake:** Manually editing `Formula/mcpx.rb` and committing SHA256 hashes.

**Why this is wrong:**
- `homebrew-mcpx` is like a build output directory, not source code
- CI completely regenerates the formula file (`cat > Formula/mcpx.rb << EOF`)
- Local builds produce different SHA256 than CI builds (different Bun versions, build flags, timestamps)

**Correct mental model:**
1. Push tag to main repo → CI builds all binaries → CI updates homebrew formula
2. Never touch `Formula/mcpx.rb` manually
3. If formula is wrong, fix the CI workflow, don't patch the output

See `/Users/dio/Projects/homebrew-mcpx/CLAUDE.md` for full workflow documentation.

## Architecture Decisions Worth Remembering

### Why We Removed "Pseudo-JS" Label (v0.5.0)

Function call syntax `tool(arg: "value")` is just parsing, not JS execution. User questioned why we called it "JS expression support" when we don't actually run JS code.

**Decision:** Keep the syntax for convenience, but clarify it's **data format parsing**, not code execution. Added explicit data format alternative: `{ function: "server.tool", args: {...} }`.

### Why TOON is Default Output

LLM-friendly compact format. Users override with `--output json` when needed for scripts.

### Why We Deleted emit-ts Command (Design Philosophy)

**Original approach was over-engineered:**
- `emit-ts --mode types --out-path types.ts` - complex flags and template system
- Generated huge JSON schemas + markdown comments + excessive indentation
- User gets opaque generated code they can't easily modify
- Template maintenance burden

**Better approach:**
```bash
mcpx list linear > linear-types.ts
# Add `export` manually if needed. Done.
```

**Why this is better:**
- User sees clean TypeScript type specs directly
- Output is human-readable and editable
- No template system to maintain
- For CLI tool calls, LLM reads the spec directly; for programmatic use, redirect to .ts file

**Principle:** Prefer composable CLI outputs over specialized code generators. Let users decide how to use the output.

## Patterns to Repeat

### Auto-Import Version

```typescript
import { version as packageVersion } from "../package.json" with { type: "json" };
```

Single source of truth. Bun may inline at build time.

### CLAUDE.md for Non-Obvious Repos

Add CLAUDE.md to repos with:
- CI-generated files that look like source code
- Complex release workflows
- Multi-repo dependencies

Future Claude sessions auto-load this context.

## Key Principles

1. **Generated artifacts ≠ source code** - Never manually edit CI outputs
2. **Trust automation** - If CI exists, don't work around it
3. **Semantic honesty** - Don't call something "JS support" if it's just parsing
4. **Document constraints** - CLAUDE.md prevents repeat mistakes
