# CLAUDE.md

Guidance for Claude Code working in this repository.

## Core Philosophy

**Simplicity is mandatory.** Always implement the simplest solution that works. If a simple feature needs more than 20 lines, stop and reconsider. Direct solutions beat clever architecture. Try removing code before adding code. Question every new dependency, hook, or context.

## Rules

### Simplicity & State
- No fake "safety" systems — use database transactions, not backup/restore in app code
- No staged deletions — just delete the data
- No temporary UI state that doesn't map to the database — load fresh data when needed
- No complex state synchronization or staged/pending/deleted tracking

### Fail Fast
- Report errors immediately. Never pretend success when operations fail
- Never hide errors with complex error handling

### No Scope Creep
- Only fix the exact problem asked about — nothing more
- Never "fix" unrelated TypeScript warnings or build errors unless they block your change
- Ignore pre-existing issues unless specifically asked
- Only fix build errors directly caused by your changes

### Task Confirmation Protocol
- Repeat back the user's request, confirm the component/file, and state which files you'll examine
- Wait for confirmation before proceeding (exception: simple questions — just answer directly)

### Debugging
- Never ask the user to test or debug for you — solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow → identify root cause → implement direct fix

## Infrastructure

- Local dev uses a local Postgres database
- Production runs on a Hetzner VPS managed by Coolify
- Use the Coolify MCP for server/database operations when needed

## Development Commands

```bash
npm run dev      # Dev server (Next.js + Turbopack)
npm run build    # Production build
npm start        # Production server
npm run lint     # ESLint
```
