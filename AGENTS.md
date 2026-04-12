# AGENTS.md

Guidance for Codex working in this repository.

## Core Philosophy

Simplicity is mandatory. Always implement the simplest solution that works. If a simple feature needs more than 20 lines, stop and reconsider. Direct solutions beat clever architecture. Try removing code before adding code. Question every new dependency, hook, or context.

## Rules

### Simplicity & State
- No fake "safety" systems - use database transactions, not backup/restore in app code
- No staged deletions - just delete the data
- No temporary UI state that doesn't map to the database - load fresh data when needed
- No complex state synchronization or staged/pending/deleted tracking

### Fail Fast
- Report errors immediately. Never pretend success when operations fail
- Never hide errors with complex error handling

### No Scope Creep
- Only fix the exact problem asked about - nothing more
- Never "fix" unrelated TypeScript warnings or build errors unless they block your change
- Ignore pre-existing issues unless specifically asked
- Only fix build errors directly caused by your changes

### Shared UI Boundaries
- Never change `packages/admin-shell` UI directly for an app-specific need
- Build app-specific branding, navigation, and layout in the app itself using shared primitives
- Only change `packages/admin-shell` when the user explicitly asks for a shared package change

### Response Format
- Prefer structured answers over dense paragraphs when summarizing code, architecture, or project state
- Use short sections with clear labels when the response covers more than one topic
- Use flat bullets for distinct points, systems, or findings
- Keep paragraphs short and easy to scan
- Avoid wall-of-text explanations when a structured format would be clearer

### Debugging
- Never ask the user to test or debug for you - solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow -> identify root cause -> implement direct fix

### Live Validation
- Do not proactively use live/browser validation
- Only run browser validation when the user explicitly asks to validate, test, verify, or check it
- Build and typecheck are allowed without asking unless the user says otherwise

## Repository Structure

This is a Turborepo monorepo with npm workspaces:

```text
├── apps/hub/          # Main Next.js app (website builder SaaS)
├── packages/          # Shared packages (future - extract when building 2nd app)
├── services/          # Python/other services (future)
├── package.json       # Root workspace config
├── turbo.json         # Turborepo task config
└── Dockerfile         # Builds apps/hub for production
```

All app code lives in `apps/hub/`. The root `package.json` is the workspace root - app dependencies are in `apps/hub/package.json`.

## Infrastructure

- Local dev uses a local Postgres database
- Production runs on a Hetzner VPS managed by Coolify
- Dockerfile at repo root builds the hub app (standalone output)
- Use the Coolify MCP for server/database operations when needed

## Auth And Migrations

- Current app auth is Better Auth, not Supabase
- `apps/hub/migrations/` contains legacy SQL and historical/manual migrations from older Supabase-era patterns
- Do not assume `auth.uid()`, `auth.role()`, `auth.users`, storage policies, or `supabase_url` in those SQL files reflect the current runtime architecture
- When adding new database work, follow current runtime code and Drizzle schema, and validate auth assumptions against the app before copying legacy SQL patterns

## Development Commands

```bash
npm run dev
npm run build
npm run lint
```

```bash
cd apps/hub
npm run dev
npm run build
npm start
```

## Repo Skills

Project-local Codex skills are stored in `.codex/skills/`.

Available skills:
- `.codex/skills/block-builder`
- `.codex/skills/commit`
- `.codex/skills/playwright-cli`
- `.codex/skills/vulnerability-validater`

When a task matches one of these skills, prefer using the local `SKILL.md` in that folder before falling back to generic behavior.
