# Cloud Antidetect Browser — Build Plan

Internal multi-account browser tool. Cloud-hosted browsers, streamed to a web
dashboard, each profile isolated with its own fingerprint and proxy. Built on
the existing `custom-shell` app (TanStack Start + Drizzle + Postgres + R2).

---

## 1. What we're building

A **profile** is the core unit: a persistent, isolated browser that lives on a
server and streams to your screen.

- **Isolated** — its own user-data-dir (cookies, storage, history); never mixes
  with other profiles.
- **Fingerprinted** — a consistent, believable browser fingerprint (canvas,
  WebGL, audio, fonts, UA, screen, timezone) baked into a compiled browser fork.
- **Proxied** — its own residential/mobile proxy for egress; geo/timezone/locale
  must match the fingerprint.
- **Streamed** — runs in a server container, screen streamed over WebRTC to a
  web view you click in (manual multi-account use).
- **Persistent** — cookies survive container teardown; a profile can resume on
  any worker node from an object-storage snapshot.

Everything else (dashboard, orchestrator, fingerprint/proxy services) exists to
manage that unit.

## 2. Decisions locked

| Question | Decision |
|---|---|
| Goal | Internal/personal tool (no billing, no multi-tenant SaaS) |
| Browser engine | Stand on an **open-source compiled fork** (tier-1 stealth, no self-built Chromium) |
| Run model | **Cloud-hosted browsers + WebRTC streaming** |
| Use case | **Manual** multi-account management |
| Scope | Solid foundation — build it right |
| App base | `apps/custom-shell` (TanStack Start, Drizzle, Postgres, Cloudflare R2) |
| Hosting | Hetzner via Coolify; dedicated larger boxes for browser worker nodes |

### Why an open-source compiled fork

Stealth tiers, strongest first:

1. **Compiled C++ patches into a Chromium/Firefox fork** — strongest; the site
   sees a real browser because the binary *is* real (what Orbita/SunBrowser do).
2. **Standing on an open-source compiled fork** (Camoufox, CloakBrowser,
   itbrowser) — *same stealth tier*, because patches are already compiled in.
   We don't pay the Chromium rebasing cost. **This is our choice.**
3. **JS/CDP injection** (playwright-stealth) — weakest; detectors fingerprint
   the override itself.

Caveat: open-source forks lag the commercial engines, which are continuously
maintained against new detectors. Acceptable for internal use; expect the most
aggressive sites (late-model Facebook/TikTok) to occasionally win.

## 3. Architecture

```
┌─ Web dashboard (custom-shell / TanStack Start) ─────────────┐
│   Profile list · create/edit (fingerprint+proxy) · Launch   │
│   Launch → embedded WebRTC stream (Neko client)             │
└───────────────┬─────────────────────────────────────────────┘
                │ control API (Nitro server routes)
┌───────────────▼─── Control plane (in custom-shell) ──────────┐
│  • profile CRUD            • fingerprint generation          │
│  • session lifecycle       • proxy assignment + testing      │
│  • orchestrator (dockerode → Docker Engine API)              │
│  • capacity-aware scheduling + idle reaping                  │
└───────────────┬──────────────────────────────────────────────┘
                │ Docker Engine API
┌───────────────▼─── Worker node(s) — Hetzner ────────────────┐
│  One container per ACTIVE profile:                          │
│   ┌──────────────────────────────────────────────┐         │
│   │ patched browser fork (fingerprint baked in)   │         │
│   │ + Xvfb virtual display                        │         │
│   │ + Neko (WebRTC streamer)                      │         │
│   │ + egress via this profile's proxy             │         │
│   │ + mounted persistent user-data-dir            │         │
│   └──────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘

Postgres : profiles, fingerprints, proxies, browser_sessions, (workspaces=groups)
R2/S3    : user-data-dir snapshots (resume on any node)
```

### Reuse from custom-shell (already built)

- **Auth + sessions + roles** — `custom_shell_users` (argon2) + `custom_shell_sessions`.
- **Object storage** — `@aws-sdk/client-s3` + Cloudflare R2 → user-data-dir snapshots.
- **Workspaces** — repurpose as profile groups/scoping.
- **Dashboard primitives** — shadcn/ui, `@tanstack/react-table`, dnd-kit, zod.
- **Server routes + Drizzle migration flow**.

### Net-new components

- **Schema:** `profiles`, `fingerprints`, `proxies`, `browser_sessions`
  (NOT `custom_shell_sessions` — that's auth).
- **Fingerprint generation** (Browserforge) — Nitro server function.
- **Proxy testing** (reachability/geo/latency) — Nitro server function.
- **Orchestrator** (`dockerode`) — Nitro routes first; extract to standalone
  service when multi-node.
- **Browser container image** — fork + Xvfb + Neko + proxy egress + volume.
- **Neko stream embed** — new route in `_authenticated` group.

## 4. Tech choices

| Layer | Choice | Notes |
|---|---|---|
| Browser engine | Evaluate **Camoufox** (Firefox) vs **itbrowser** (Chromium GUI) in Phase 0; pick by stealth scores | Both compiled-patch, run headful |
| Streaming | **Neko** (`m1k1o/neko`) — WebRTC, Docker-native | Low latency for manual clicking; noVNC too laggy |
| Orchestration | `dockerode` → Docker Engine API; **Nomad** if multi-node later | k8s overkill for solo |
| Fingerprint gen | **Browserforge / fingerprint-suite** (Apify) | Consistent, real-world distributions |
| Backend + UI | custom-shell (TanStack Start + shadcn) | No new stack |
| Persistence | Per-profile Docker volume + snapshot to **R2** | Cookies must survive teardown |
| Proxies | Buy residential/mobile (e.g. IPRoyal, Bright Data) | Quality drives ban rate more than fingerprint |

## 5. Data model (new tables)

All prefixed `custom_shell_` to match convention. `varchar(36)` ids, tz-aware
timestamps.

- **`custom_shell_profiles`**
  - `id`, `user_id` (fk), `workspace_id` (nullable, group), `name`, `status`
    (`stopped`/`starting`/`running`/`error`), `fingerprint_id` (fk),
    `proxy_id` (fk, nullable), `engine` (`camoufox`/`chromium`),
    `data_snapshot_path` (R2 key, nullable), `notes`, `created_at`, `updated_at`.
- **`custom_shell_fingerprints`**
  - `id`, `profile_id` (fk, 1:1), `config` (jsonb — full Browserforge fingerprint),
    `os`, `browser`, `screen`, `timezone`, `locale`, `created_at`.
- **`custom_shell_proxies`**
  - `id`, `user_id` (fk), `label`, `type` (`residential`/`mobile`/`datacenter`),
    `host`, `port`, `username`, `password` (encrypted at rest), `country`,
    `last_tested_at`, `last_test_result` (jsonb), `created_at`, `updated_at`.
- **`custom_shell_browser_sessions`**
  - `id`, `profile_id` (fk), `node_id`, `container_id`, `stream_url`,
    `status`, `started_at`, `ended_at`, `last_active_at` (for idle reaping).

## 6. Phased roadmap

### Phase 0 — De-risk (1–2 weeks) — DO THIS FIRST

Independent of custom-shell. Answers "is stealth + streaming viable in a container?"

1. Pick 2 candidate forks (Camoufox, itbrowser).
2. For each: Dockerfile with the fork + Xvfb + Neko, egress routed through a
   real residential proxy.
3. Stream to a browser; manually verify clicking feels live.
4. Run the fingerprint gauntlet: **CreepJS, BrowserLeaks, Pixelscan, iphey**.
   Record scores; confirm fingerprint is consistent across restarts.
5. **Decision gate:** both stealth + streaming pass → proceed. Pick the winning
   engine. If neither passes, stop and reconsider (local desktop, or commercial
   engine license).

Deliverable: `docker/phase0/` + a results table.

### Phase 1 — Single-profile vertical slice (1–2 weeks)

Harden Phase 0 into a repeatable container template.

- One parameterized image: fork + Xvfb + Neko + injected proxy + injected
  fingerprint config + mounted persistent user-data volume.
- Launch via script with env: proxy creds, fingerprint json, volume path.
- **Success test:** launch → log into a real account → kill container →
  relaunch → still logged in, same fingerprint, same proxy.
- Snapshot/restore the user-data-dir to/from R2.

Deliverable: `docker/browser/` image + launch script + snapshot script.

### Phase 2 — Control plane + orchestration (2–3 weeks)

In custom-shell.

- Drizzle migration: the 4 tables above.
- Orchestrator module (`src/server/orchestrator/`):
  - `startSession(profileId)` — pull snapshot from R2 → mount volume → start
    container with fingerprint+proxy → wait for Neko ready → write
    `browser_sessions` row → return stream url.
  - `stopSession(sessionId)` — graceful browser close → snapshot volume to R2 →
    remove container → mark session ended.
  - `reapIdle()` — cron: stop sessions past idle threshold.
- Nitro API routes (`src/routes/api/v1/profiles/...`, `.../sessions/...`)
  with auth + ownership checks on every mutation.
- Fingerprint generation server fn (Browserforge) on profile create.
- Proxy CRUD + test server fn.

Deliverable: working API — create profile, start/stop session via curl,
cookies persist across sessions.

### Phase 3 — Dashboard UI (2 weeks)

In custom-shell `_authenticated` group.

- **Profiles page** — react-table grid: name, group, proxy, status, last used;
  row actions (launch/stop/edit/delete).
- **Create/edit profile** — name, group, engine, proxy picker, "generate
  fingerprint" + preview (os/browser/screen/timezone).
- **Launch view** — full-screen embedded Neko client; start/stop controls,
  connection status, proxy/fingerprint summary sidebar.
- **Proxies page** — CRUD + "test" button surfacing geo/latency.

Deliverable: end-to-end manual flow — create profile in UI, launch, click
around in a streamed browser, close.

### Phase 4 — Fingerprint & proxy quality (1–2 weeks)

- Browserforge-driven generation tuned to real distributions.
- **Match fingerprint timezone/locale/geo to the assigned proxy** (mismatch is
  the #1 giveaway).
- Proxy testing pipeline: reachability, resolved geo, latency, on assign + on a
  schedule; flag dead proxies.
- Re-run the Phase 0 gauntlet from inside the real product; record a baseline.

### Phase 5 — Solid-foundation polish (2–3 weeks)

- Profile groups/tags (workspaces), bulk actions, search/filter.
- Cookie import/export (JSON) per profile.
- Volume snapshot/restore UI + retention.
- **Capacity-aware scheduling** across worker nodes + **idle reaping** +
  per-user concurrency caps (cost control).
- Roles/permissions if more than one operator.
- Observability: per-session resource usage, node health, stealth-test history.

## 7. Infrastructure & capacity

- **Worker nodes** run Docker; control plane talks to them via Docker Engine API
  (TLS). Start with one node, design for N.
- **Capacity planning:** budget **~1.5 GB RAM + ~0.5 vCPU per *active* profile**.
  - 32 GB / 8-core Hetzner box → ~15–20 concurrent active profiles.
  - Idle profiles are torn down (snapshot saved), freeing resources — this is
    mandatory or cost explodes. This is the price of the cloud model vs local.
- **Snapshots** in R2 let any node resume any profile → horizontal scaling.
- **Networking:** each container egresses only through its assigned proxy; block
  direct egress to prevent IP leaks. WebRTC ports exposed only to the control
  plane / authenticated stream.

## 8. Risks & realities

- **Capacity/cost is the real tax** of cloud-hosted browsers. Idle reaping is
  not optional.
- **Proxy quality > fingerprint perfection** for avoiding bans. Recurring cost.
- **Stealth decays** — open-source forks lag; schedule periodic re-testing.
- **Attestation cat-and-mouse** — Google's vendor-attestation APIs flag any
  fork. Category-wide maintenance reality, not a one-time fix.
- **WebRTC streaming latency** over distance — keep worker nodes geographically
  close to operators, or accept some lag.
- **ToS/legal** — multi-accounting violates many sites' terms; this is an
  internal tool, use accordingly.

## 9. Definition of done (v1)

- Create a profile in the dashboard with a generated fingerprint + assigned
  proxy.
- Launch it; a real browser streams to the web view; manual clicking is usable.
- Log into an account; close; relaunch days later — still logged in, same
  fingerprint, same proxy, from a different node if needed.
- Passes CreepJS/BrowserLeaks/iphey at the baseline recorded in Phase 0.
- Idle profiles auto-stop and free resources.

## 10. Rough timeline

| Phase | Estimate |
|---|---|
| 0 — De-risk | 1–2 weeks |
| 1 — Single-profile slice | 1–2 weeks |
| 2 — Control plane | 2–3 weeks |
| 3 — Dashboard | 2 weeks |
| 4 — Fingerprint/proxy quality | 1–2 weeks |
| 5 — Polish | 2–3 weeks |
| **Total** | **~9–14 weeks** part-time |

Gate after Phase 0: if stealth/streaming don't pass, revisit engine or run model
before investing in Phases 1–5.
