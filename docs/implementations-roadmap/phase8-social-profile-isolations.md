# Site-Scoped Social Profile System

  ## Summary

  - Build a dedicated Social admin area for internal staff to manage social accounts as isolated browser profiles tied to a specific siteId.
  - Treat v1 as a human-operated account maturation system, not an automation tool and not an AI product.
  - The core value of v1 is technical isolation + hard operating protocols: persistent profile separation, proxy binding, launch gating, session locking, and strict warm-
    up workflow for new accounts.
  - The benchmark for v1 is not “GoLogin parity” or “instantly trusted like a personal account.” The benchmark is: each account behaves like one coherent, long-lived,
    separate browser/device environment with no cross-contamination.
  - Build the browser runtime as a separate remote service and show sessions inside Hub as an embedded remote browser view.

  ## V1

  - Add a dedicated /admin/social section, filtered by the existing current-site context, with pages for profile list, profile detail, session history, and warm-up status.
  - Support multiple profiles per network per site. Initial platform registry: instagram | facebook | x | linkedin | tiktok | youtube | custom.
  - Each profile gets its own persistent browser storage directory, its own proxy policy, its own browser config, and at most one active session at a time.
  - Operators log in directly inside the isolated profile. Do not store social passwords, 2FA secrets, or recovery codes in Hub in v1.
  - Use a separate social-browser runtime service. Each live session starts a headed Chromium instance via Playwright launchPersistentContext, backed by that profile’s
    dedicated storage directory.
  - Render the live session inside Hub using an embedded remote viewer. Use a concrete remote-desktop stack for v1: Xvfb + Chromium + x11vnc + websockify/noVNC. Hub issues
    a short-lived signed viewer token per session; the browser service validates it before attaching the viewer.
  - Enforce hard preflight gates before any session launch:
      - profile is not already running
      - site/profile ownership is valid
      - warm-up stage allows a new session today
      - profile is not in cooldown
      - proxy resolves and authenticates
      - outbound IP is fetched successfully
      - resolved country matches the profile’s geo policy
      - timezone, locale, and WebRTC policy match the profile’s geo policy
      - profile storage directory exists and is readable
  - If any preflight gate fails, do not launch. Return a specific failure reason in the UI. Proxy down = no launch is a hard fail.
  - Keep v1 browser shaping narrow and stable: userAgent, viewport, locale, timezoneId, geolocation policy, WebRTC policy, and proxy binding. Do not implement deep Canvas/
    WebGL/font spoofing in v1.
  - Implement a universal strict warm-up protocol for all supported platforms in v1:
      - fresh: day 0-3 after first successful login, 1 session/day, 10-15 minutes, allowed intent browse
      - warming: day 4-10, max 2 sessions/day, 15-25 minutes, allowed intents browse | light_engagement
      - engaged: day 11-21, max 2 sessions/day, 20-30 minutes, allowed intents browse | light_engagement | reply
      - active: day 22+, max 3 sessions/day, normal manual use, allowed intents browse | light_engagement | reply | publish
      - cooldown: entered immediately after captcha, checkpoint, forced logout, reverification, or operator-marked risk event; no new sessions for 72 hours
  - Because v1 has no AI and no page-reading engine, enforce protocol through session intent and operator reporting:
      - before launch, the operator must choose a session intent
      - on exit, the operator must submit a short report: browse, like, reply, follow/connect, publish, checkpoint/captcha/logout, notes
      - if the report exceeds the allowed actions for the current stage, mark the profile risky and force manual review before the next launch
  - Do not auto-kill a live session if the proxy becomes unhealthy mid-session. Mark the session unhealthy, show a blocking warning banner in Hub, and require the operator
    to end the session. Never silently switch the profile to a different proxy.
  - Add audit logging for all high-signal events: create profile, update proxy policy, launch success/failure, viewer attached, session ended, cooldown entered, warm-up
    stage changed, profile deleted.
  - Deployment shape for v1:
      - Hub remains the control plane
      - social-browser is a separate service in the monorepo
      - persistent volume stores browser profile directories
      - Hub and browser service communicate over internal network with shared service auth secret
      - feature-flag the whole Social section to internal admins only

  ## Interfaces And Data

  - Add social_profiles with: id, siteId, platform, label, username, profileKey, status, warmupStage, firstLoginAt, lastLaunchAt, lastKnownIp, lastKnownCountry,
    proxyConfig, browserConfig, notes, createdAt, updatedAt.
  - Add social_profile_sessions with: id, socialProfileId, startedByUserId, intent, runtimeSessionId, viewerTokenHash, status, healthStatus, startedAt, endedAt,
    durationSeconds, launchFailureCode, operatorReport, createdAt, updatedAt.
  - Add social_profile_events with: id, socialProfileId, sessionId, eventType, payload, createdByUserId, createdAt.
  - Encrypt proxyConfig.username and proxyConfig.password at rest using the existing AES-GCM helper already used for site integrations.
  - Define shared types:
      - SocialPlatform = instagram | facebook | x | linkedin | tiktok | youtube | custom
      - WarmupStage = fresh | warming | engaged | active | cooldown | risky
      - SessionIntent = browse | light_engagement | reply | publish
      - ProxyConfig = { server, type, username?, password?, expectedCountry }
      - BrowserConfig = { userAgent, viewportWidth, viewportHeight, locale, timezoneId, webrtcMode }
      - OperatorSessionReport = { browse, like, reply, followOrConnect, publish, checkpoint, captcha, forcedLogout, reverification, notes }
  - Hub server actions:
      - create/update/archive/delete profile
      - run preflight
      - launch session
      - fetch viewer token
      - end session
      - submit operator report
      - approve/release risky profile
  - Browser-service endpoints:
      - POST /profiles/:profileKey/preflight
      - POST /profiles/:profileKey/sessions
      - GET /sessions/:runtimeSessionId
      - POST /sessions/:runtimeSessionId/end
      - GET /sessions/:runtimeSessionId/viewer-token
  - Build order:
      - schema and server actions
      - preflight and locking
      - audit logs and internal rollout

  ## V2

  - Add AI copilot features only in v2. Default scope: read page state, summarize, draft responses/captions, flag risk prompts, and suggest next steps. Do not make
    autonomous submissions the default.
  - Add optional guarded browser interaction in v2 with explicit operator confirmation per action. Keep fully autonomous workflows out of scope unless separately planned.
  - Add deeper fingerprint consistency controls only after v1 is stable: stronger device-profile presets, improved WebRTC/network shaping, and tighter cross-session
    consistency.
  - Add platform-specific warm-up policy overrides only if production usage shows the universal protocol is insufficient. The shared strict protocol remains the default
    baseline.
  - Add optional local launcher/pop-out support after the embedded remote-view flow is proven.
  - Add optional credential vault/recovery storage only if there is a concrete operational need; it is not part of the base architecture.
  - Add richer risk scoring, anomaly detection, profile sharing/handoff, role-based approvals, and more detailed recovery workflows.

  ## Test Plan

  - Ownership and tenancy: a user can only view or manage social profiles for sites they own.
  - Cardinality: one site can have multiple profiles for the same platform without data collision.
  - Isolation: two profiles never share cookies, cache, local storage, or proxy settings.
  - Launch gating: dead proxy, wrong geo, invalid timezone/locale policy, corrupted storage, active lock, or cooldown all block launch with specific reasons.
  - Runtime locking: one profile cannot have two active sessions.
  - Viewer auth: embedded viewer only loads with a valid short-lived token for the current session and user.
  - Warm-up enforcement: stage-based intent limits are enforced before launch, and operator reports can trigger risky or cooldown.
  - Session lifecycle: start, attach, unhealthy warning, end, and cleanup all update DB state correctly.
  - Storage cleanup: deleting a profile stops any live session first and then removes the persistent browser directory.
  - Audit trail: all critical actions emit event records.
  - Internal rollout: feature flag hides the Social section from non-admin users until the browser runtime is stable.

  ## Assumptions And Defaults

  - V1 is internal-only and manual-only.
  - V1 uses embedded remote browser view, not a local desktop launcher.
  - V1 enforces what the system can observe directly and uses operator-reported actions for within-session behavior, because AI/page-reading is deferred to v2.
  - V1 does not promise full anti-detect parity with GoLogin, AdsPower, or Multilogin.
  - The product goal is strong profile isolation and trust-building protocols, not automation or mass activity.
  - The current Hub site model remains the source of ownership truth; social profiles are children of siteId, not global shared assets.