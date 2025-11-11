# Specifications & Proposals

This directory contains design specifications and feature proposals for mcpx.

## Purpose

- **Design review**: Discuss architecture before implementation
- **Documentation**: Record design decisions and rationale
- **Reference**: Historical context for future contributors

## Document Format

Each proposal should include:

1. **Problem Statement**: What problem are we solving?
2. **Solution**: High-level approach
3. **API Design**: Command syntax, options, examples
4. **Architecture**: Technical design and flow
5. **Implementation Plan**: Phases, file structure, code samples
6. **Alternatives Considered**: What we rejected and why
7. **Open Questions**: Decisions to be made

## Workflow

1. **Draft**: Create proposal in `spec/<feature-name>.md`
2. **Review**: Discuss design, API, tradeoffs
3. **Approval**: Mark status as "Approved" when ready
4. **Implementation**: Build according to spec
5. **Archive**: Move to `spec/archive/` when implemented

## Status Values

- `Draft`: Under discussion
- `Approved`: Ready for implementation
- `Implemented`: Feature shipped (document moved to archive)
- `Rejected`: Not moving forward (document moved to archive)

## Current Proposals

- [proxy-command.md](./proxy-command.md) - Expose stdio servers as HTTP endpoints (Draft)
