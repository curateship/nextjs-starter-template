# Architecture Overview

`apps/antidetect` is a cloud antidetect browser — a multi-account tool where each
**profile** is an isolated browser with its own fingerprint and proxy. It is built
on the `custom-shell` base (TanStack Start + Drizzle + Postgres + R2) and keeps that
shell's app frame, sidebar/header layout, navigation, theme, and shadcn primitives;
only the product domain below is app-specific.

- **Dev port** 3005 · **env prefix** `ANTIDETECT_` · **own Postgres** on 54321.
- This file describes the app **as built**. The forward plan — the streamed browser
  engine, orchestrator, and phased roadmap — lives in `antidetect-browser-plan.md`.

## Layering

The shell owns the chrome; the product owns the domain. Within the product, every
feature follows one vertical slice:

```
server/schema.ts          Drizzle tables — the source of truth
  ↓
server/*.ts               domain logic + ownership checks (createUserProfile, …)
  ↓
lib/api/*.ts              createServerFn bridge: zod validation + auth/origin
                          guards, dynamic-imports the server module so server
                          code never reaches the client bundle
  ↓
routes/_authenticated/*   loaders call the lib/api loaders
  ↓
components/*-dashboard.tsx the UI; mutates via lib/api then router.invalidate()
```

## Request & ownership model

Middleware only guards page rendering, so **every** mutating server function
independently enforces, in this order:

1. `requireAppOrigin()` — rejects cross-origin POSTs.
2. `requireUser()` — resolves the session user.
3. **Ownership in the WHERE clause** — `eq(table.userId, userId)` (plus `inArray`
   for bulk ops), so a foreign id matches zero rows. Referenced proxies / folders /
   statuses are checked with `assert*Owned` helpers before they can be linked.

Secrets (proxy passwords) are AES-256-GCM encrypted at rest (`server/encryption.ts`,
key from `ANTIDETECT_ENCRYPTION_KEY`, fail-fast on a missing key) and are never
included in any `serialize*` output sent to the client.

## Data model (as built)

Bare table names — the `custom_shell_` prefix from the plan was dropped; isolation
is by separate database. `varchar(36)` ids, tz-aware timestamps.

**Inherited from the shell:** `users`, `sessions`, `settings`, `workspaces`,
`media`, `feedback` / `feedback_votes` / `feedback_comments`, `notifications`.

**Product tables:**

- **`proxies`** — `label`, `type` (residential/mobile/datacenter), `protocol`
  (http/https/socks5), `host`, `port`, `username`, `password` (encrypted),
  `country`, `last_tested_at`, `last_test_result` (jsonb).
- **`profiles`** — the core unit. `name`, `status` (runtime:
  stopped/starting/running/error), `engine` (camoufox/chromium), `proxy_id`
  (set null on proxy delete), **`fingerprint` (jsonb — the full generated identity,
  embedded directly, not a separate table)**, plus organization: `folder_id`,
  `status_id` (both set null on delete), `tags` (jsonb array), `notes`.
- **`profile_folders`** — per-user groups.
- **`profile_statuses`** — per-user customizable workflow labels (name + palette
  color), unique per `(user_id, name)`, auto-seeded Ready/Warming/Banned on first use.

> **Divergence from the plan:** fingerprints are an embedded jsonb column (not a 1:1
> `fingerprints` table), generation is a hand-rolled seeded generator (not
> Browserforge), and `browser_sessions` is not built yet.

## Key subsystems

**Fingerprint engine — `server/fingerprint.ts`.** `generateFingerprint({ os, engine,
proxyGeo, seed })` is deterministic (mulberry32 PRNG): a numeric seed reproduces an
identity exactly, so the dialog preview equals what gets saved and "Regenerate" is
just a new seed. The output is internally coherent (UA / platform / screen / WebGL /
fonts / cores all agree with os+engine; `deviceMemory` capped at the spec's 8) and
matched to the proxy's exit geo (timezone + locale from the proxy's tested country —
a US exit on a Moscow clock is an instant tell). This object is also the **launch
input**: it is shaped to map onto the engine's fingerprint config in Phase 1.
`coerceFingerprint` normalizes pre-fingerprint rows so the UI always has a full one.

**Proxy subsystem — `server/proxy-test.ts`.** `testProxyConnection` routes a probe to
ipinfo *through* the proxy via `https-proxy-agent` / `socks-proxy-agent`, returning
ip / country / isp / timezone / latency. A successful test back-fills the proxy's
country (when blank), which then feeds the fingerprint timezone. Bulk import parses
`host:port:user:pass` lines.

**Organization.** Folders, customizable statuses, and tags, with bulk actions
(move / set-status / add-tag / delete) implemented as single `inArray + userId`-scoped
statements, plus duplicate (clones config with a fresh fingerprint = a new identity)
and client-side search / filter over the loaded list.

## Migrations

Plain SQL files in `drizzle/`, applied via `psql` — there is no drizzle journal; the
test suite (`server/profiles.test.ts`, pglite) reads the files directly. Current:
`0000` baseline → `0007` (status unique constraint). Column/constraint additions are
written idempotently (`ADD COLUMN IF NOT EXISTS`, `DO $$ … duplicate_object …$$`).

## Built vs. planned

- **Built:** auth/sessions (inherited), profiles + proxies CRUD, the fingerprint
  engine, real proxy testing + geo, profile organization, and all dashboards.
- **Planned (see `antidetect-browser-plan.md`):** the streamed browser itself — a
  per-profile container (compiled browser fork + Xvfb + Neko/WebRTC + proxy egress +
  persistent user-data-dir), the `dockerode` orchestrator, `browser_sessions`, and
  snapshot/resume to R2. **Launch is currently an honest placeholder**; the engine is
  proven in `docker/` (Phase 0). Next: the Phase 0 gate → Phase 1 single-profile
  launch that consumes the fingerprint + proxy above.
