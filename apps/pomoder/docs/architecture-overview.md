# Pomoder architecture

## Runtime

The web and worker services use the same image. The web service renders the app, handles typed server functions, Stripe webhooks, private media, and room SSE. The worker consumes pg-boss jobs for media processing, AI generation, room transitions, cleanup, and aggregate repair.

The authenticated `/admin` shell remains the operational management surface. Its existing feedback, notification, workspace, settings, and media tools are preserved and are extended with Pomoder-specific management pages.
Pomoder management tables use server pagination, a single validated CRUD contract, and transactional audit logging. Object deletion is decoupled through a durable PostgreSQL queue consumed by the worker.

PostgreSQL is authoritative for accounts, subscriptions, tasks, completed focus sessions, leaderboard aggregates, rooms, chat, media metadata, and AI credits. Guest timer/tasks/preferences remain in versioned browser storage until the first authenticated import.

## Core invariants

- Only completed focus-mode sessions affect statistics.
- Focus completion uses a per-user idempotency key.
- Previous-day active tasks are archived and cloned once.
- A user has at most one active room membership.
- Room phases use server timestamps; joins are locked during focus.
- Only the host advances a room through the canonical phase sequence; every timed phase schedules exactly one sequence-guarded worker job, so stale jobs no-op.
- Every fourth completed focus period earns the long break; a host who leaves or starts hosting elsewhere closes their room and ends all memberships.
- Room SSE snapshots carry display names, roles, and chat only — never account fields; unlisted rooms resolve by direct slug but never appear in public listings.
- Moderation is role-scoped per mutation: members report others' messages (deduplicated and rate limited), the host soft-deletes messages and removes or bans members (never themselves), and a ban ends the membership in the same transaction and blocks rejoining. Deleted chat tombstones withhold the body from members but keep it for admin review; report review state changes are admin-only and audited.
- Leaderboard inclusion requires opt-in and a public display name.
- Focus history reports are owner-scoped, limited to preset local-date ranges resolved in the user's timezone (at most one year), and count completed focus-mode sessions only; 12-month and yearly ranges require the Pro entitlement.
- Timer presets: built-ins ship in code with stable identifiers and are never inserted per account; custom presets are owner-scoped with a transactional ten-per-user limit (owner-row lock) and per-user unique names; applying a preset writes through the canonical preference mutation and never changes a running or paused timer.
- Entitlements are calculated server-side from synchronized Stripe state.
- AI credits are reserved transactionally and refunded on permanent failure.
- Private R2 objects are streamed only after owner/catalog authorization.
- Deleted media objects remain queued until R2 confirms deletion.
- Every privileged Pomoder mutation records its actor, action, resource, record IDs, and timestamp.

## Public HTTP routes

- `GET /api/rooms/:slug/events` — authenticated SSE snapshot stream.
- `POST /api/media` — authenticated Pro multipart upload.
- `GET /api/media/:id/file` — authenticated private range delivery.
- `POST /api/webhooks/stripe` — signature-verified raw Stripe webhook.
- `GET /api/health/live` — process liveness.
- `GET /api/health/ready` — database and worker readiness.
- `GET /api/metrics` — bearer-protected Prometheus metrics.

Other product mutations use typed TanStack server functions with Zod boundary validation.
