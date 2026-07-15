# ADR-001: PostgreSQL-centered Pomoder platform

## Status

Accepted — 2026-07-14

## Context

Pomoder needs transactional focus/task data, subscription entitlements, durable background work, synchronized room clocks, presence/chat fanout, and a deployment that fits the existing Hetzner/Coolify stack.

## Decision

Use TanStack Start for web/API boundaries, PostgreSQL/Drizzle for canonical data, pg-boss for jobs, PostgreSQL notifications plus SSE for room fanout, private R2 for media, and separate web/worker processes built from one image.

The Custom Shell admin surface and its management tables are retained. Pomoder product tables are added alongside them, and guest mode remains local until a guarded one-time authenticated import.

## Alternatives considered

- Managed realtime: rejected to keep data and operations in the existing backend.
- WebSockets: rejected because room updates are server-to-client snapshots and SSE is simpler to proxy/reconnect.
- Browser-controlled room clocks: rejected because clients cannot authoritatively enforce joins or transitions.
- Replacing the admin shell with database-only management: rejected because operators need a first-class dashboard.

## Consequences

PostgreSQL availability is required for authenticated features and workers. SSE proxies must disable buffering. Provider work is asynchronous and observable through media status. Web and worker releases must share schema-compatible code.
