# AGENTS.md

Guidance for Codex working in this repository.

## Labels

I/me/we - refers to me the person that that talks to you
You - refers to the person that respond to me (I)
Agent - refer to the actual agent that writes the code
User - refers to the person that uses our app

If I say "Hub" refer to the Hub App
If I say "Core" refer to the Core App
If I say "Ai Video" refer to the ai-video App
If I say "Custom Shell" refer to the custom-shell App

## Core Philosophy

Simplicity is mandatory. Always implement the simplest solution that works. If a simple feature needs more than 20 lines, stop and reconsider. Direct solutions beat clever architecture. Try removing code before adding code. Question every new dependency, hook, or context.

For small fixes, do not add new helpers, abstractions, fallback paths, or alternate data flows.
Change the smallest existing line that is wrong.
If you think more is needed, stop and ask before editing.

Do not expand a small request into broad cleanup, scoring changes, helper abstractions, fallbacks, edge-case systems, or adjacent fixes unless explicitly asked. Make the narrowest change that satisfies the request, then stop. If a nearby issue seems important, mention it instead of patching it.

## Small Request Discipline

- If the user asks for a small visible change, implement the smallest visible change only.
- Prefer returning display-ready data for tiny UI features instead of exposing broad intermediate state that forces the UI to duplicate business logic.
- Fix only the requested behavior. Do not add adjacent states, edge-case handling, dashboards, status systems, or future-proofing unless they are required for the exact request.

## Coding Standards

- Do not layer shortcut props, one-off overrides, or patchwork fixes on top of a mismatched abstraction. If behavior represents a real product or domain variant, name it directly and wire it through the existing pattern.
- Prefer coherent changes that align the shared API, call sites, and rendering behavior together. Remove temporary workaround code once the correct shape is clear.
- When reusing an existing component, preserve its intended semantics. If only part of the behavior is shared, split or extend the abstraction cleanly instead of borrowing a nearby mode and overriding side effects.

## Rules

### Communication
- Explain things in plain human language first. Avoid dense technical wording unless the user asks for details.
- If technical details matter, lead with the simple answer, then add the technical reason in short follow-up sentences.
- Do not use vague words like "scan", "process", "read", or "handle" without saying exactly who is doing it: the app, the database, the browser, or the server.
- If the user asks a direct question, answer that exact question first before adding context.

### App-Specific Instructions
- Before working in a specific app or service directory, check for a local `AGENTS.md` in that directory and follow it for that scope.
- App-specific `AGENTS.md` files override root-level guidance when the instructions are more specific to that app. Example: For work in `apps/hub/**`, follow `apps/hub/AGENTS.md`.


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
