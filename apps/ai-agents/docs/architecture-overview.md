# Architecture Overview

`ai-agents` is a voice-AI agent dashboard: build phone agents, manage a
contacts CRM, run outbound call campaigns, and review recordings/transcripts.
Telephony, speech, and AI are delegated to a voice provider (Vapi today); this
app owns the canonical data and the operator UI.

It is built on the `custom-shell` template (Vite + TanStack Start, TanStack
Router file routes, Drizzle + Postgres, session auth, shadcn/ui) and follows
the same conventions as its sibling apps (`ai-video`, `antidetect`):

- App port **3006**, own Postgres via `docker-compose.yml` (**54323**, db `ai_agents`)
- Env vars prefixed `AI_AGENTS_*` (see `.env.example`)
- Hand-written sequential SQL migrations in `drizzle/`, applied with psql
- Real type checking is `npx tsc -p tsconfig.app.json --noEmit`
  (`npm run typecheck` is a no-op — solution-style tsconfig)

## Layering

Every domain feature is three files deep, same as ai-video:

```
src/server/<domain>.ts      server-only logic; auth via requireUserWorkspace()
src/lib/api/<domain>.ts     createServerFn + zod + dynamic import + safe-error allowlist
src/components/<domain>-*.tsx  dashboards/dialogs; routes stay thin
```

- `src/server/workspace-context.ts` — `requireUserWorkspace()` resolves the
  user + active workspace; every domain table carries `workspace_id` so the
  app can become multi-tenant without schema changes.
- Mutating server functions call `requireAppOrigin()` (CSRF guard) and verify
  workspace ownership independently.
- `src/lib/api/shared.ts` — shared zod fragments (`idSchema`, …) and
  `makeSafeErrorMessage` (only allowlisted/provider messages reach the UI).

## Voice provider layer (`src/server/providers/`)

The provider abstraction is deliberately thin:

- `types.ts` — the `VoiceProvider` interface (assistant CRUD, start outbound
  call, get call, list phone numbers), normalized call/config types, and
  `ProviderError { status }` so callers branch on HTTP status (429 rate
  limit, 404 already-deleted) instead of parsing message strings.
- `vapi.ts` — the only implementation. Exports **`normalizeVapiCall`**, the
  single mapping from provider payloads to our normalized call shape, used by
  BOTH polling and the webhook; `parseVapiWebhookCall` keeps webhook envelope
  knowledge in this file.
- `index.ts` — `getVoiceProvider()` returns the Vapi adapter; one switch
  statement when a second provider (Retell/Bland) arrives.

**Sync rule:** saving an agent pushes to the provider FIRST, then writes the
DB — the database never claims a config the provider doesn't have. With no
API key configured, saves stay local-only (`provider_assistant_id` null,
"Not synced" badge) and calling features refuse with a clear message.

## Data model (`src/server/schema.ts`, `drizzle/0004_voice_domain.sql`)

Nine workspace-scoped tables on top of the shell baseline (users, sessions,
workspaces, …):

- **contacts** — E.164 phone with `UNIQUE(workspace_id, phone)` (the identity
  CSV re-imports upsert on), jsonb `custom_fields` (become `{{variables}}` in
  prompts), `tags[]`, `do_not_call`
- **contact_notes**, **contact_lists**, **contact_list_members**
- **agents** — prompt/model/voice/transcriber config + provider sync state
- **phone_numbers** — mirrored from the provider; campaigns FK-restrict them
- **campaigns** — draft → running → paused → completed; FK-restrict to
  agent/list/number
- **campaign_recipients** — snapshot of the list at launch; per-recipient
  status (pending/calling/completed/failed/skipped) + error text. No counter
  columns — stats are one `GROUP BY count(*)` at read time.
- **calls** — `provider_call_id`, `direction` (inbound-ready), status,
  recording/transcript/summary/cost, and a **denormalized customer_number**
  so history survives contact deletion

## Call lifecycle — no background worker

The campaign detail page's 3-second poll IS the dialer
(`tickCampaignForCurrentUser` in `src/server/campaigns.ts`):

1. Refresh in-flight calls from the provider (in parallel).
2. While running and below `AI_AGENTS_MAX_CONCURRENT_CALLS` (default 5),
   claim pending recipients via a conditional `pending → calling` UPDATE —
   the DB transition is the re-entrancy guard — and place their calls with
   contact `{{variables}}` (`buildContactVariables` in `contacts.ts`).
   A 429 releases the claim for the next tick; real failures mark the
   recipient failed with the error text.
3. Complete the campaign when nothing is pending or in flight.

Closing the tab pauses dialing — an accepted single-user trade-off (the UI
says "keep this page open"). Revisit with a server-side loop if this goes
multi-tenant.

**Call state has exactly one write path:** `applyNormalizedCall` in
`src/server/calls.ts`. Both the dashboard polls and the webhook
(`src/routes/api/v1/vapi/webhook.ts`, optional `x-vapi-secret`) feed
normalized calls through it; it also flips campaign recipients when a call
reaches a final state. Polling makes local dev fully functional without a
public URL; in production, set `AI_AGENTS_PUBLIC_URL` so synced assistants
get a webhook `serverUrl` and results land instantly.

## CSV import (`src/server/contacts-import.ts`)

Client-side parsing (papaparse) + column mapping UI → server-side per-row
E.164 normalization (libphonenumber-js, `AI_AGENTS_DEFAULT_COUNTRY`),
invalid/duplicate rows reported with reasons, then one chunked
`INSERT … ON CONFLICT (workspace_id, phone) DO UPDATE` — non-empty incoming
values win, custom fields merge — so re-imports update instead of
duplicating. Cap: 10,000 rows per import.

## UI conventions

- Dashboards follow the `DashboardTable` pattern (toolbar, selection,
  pagination); live screens use gated 3s polls that stop when nothing is
  active.
- **All modals share the shell's anatomy** — `DialogContent variant="admin"`,
  title + one-line description, flat labeled fields, section header rows with
  their action on the right, dashed empty states, primary action bottom-right
  in `DialogFooter`. `sidebar-settings.tsx` is the canonical example.
- Shared building blocks: `error-alert.tsx`, `confirm-delete-dialog.tsx`,
  `lib/format.ts` (dates), `lib/call-format.ts` / `lib/campaign-format.ts`
  (status labels/badges).
- The Voice Provider connection lives as a tab inside Settings
  (`settings-page.tsx` → `provider-settings.tsx`).

## What the shell owns vs. the product

The shell (copied from `custom-shell`) still owns the app frame, sidebar +
sticky header, theme, workspace switcher, settings (General/Sidebar/Top
Navigation), feedback, notifications, and media library. Product code stays
in the domain modules/components listed above; the only shell files the
product touched are `settings-page.tsx` (Voice Provider tab),
`workspaces.ts` (default sidebar sections: Calling → Agents/Contacts/
Campaigns/Calls), and `dashboard-table.tsx` (footer made optional).
