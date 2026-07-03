---
name: API Usage Dashboard
status: done
---

# API Usage Dashboard

## Summary

Build a unified action-credit system for billable AI usage.

Existing `admin` users act as superadmins: they get a full `/admin/api-usage`
dashboard to monitor all users, set the default monthly credit cap, and override
individual users. All users get a compact sticky-header credit indicator that
opens a usage modal with their remaining credits and history.

## Task #1

Add canonical API usage persistence.

- Add usage tables for monthly credit limits, usage events, and threshold alert dedupe.
- Scope usage events to the user who triggered the billable action.
- Store provider, feature, model, credit amount, status, metadata, and created date.
- Use UTC month boundaries for monthly periods.
- Seed the default monthly cap to `1000` credits.
- Add indexes for period, user, provider, feature, and created date dashboard queries.

## Task #2

Add a server-side credit policy and limiter.

- Use action credits with fixed v1 weights:
  - Text generation: `1`
  - Captions or analysis: `2`
  - Voiceover: `5`
  - Image generation: `10`
  - Veo video generation: `50`
- Warn at `80%` and block at `100%`.
- Check the limit before provider calls.
- Record a blocked event when a request is rejected at the cap.
- Record failed provider attempts if the provider request was made.
- Replace the old actor image hourly limiter with this unified limiter.

## Task #3

Instrument billable AI actions.

- Track Gemini/OpenAI generation and transcription calls.
- Track Veo video generation starts.
- Track ElevenLabs voiceover generation.
- Track viral analysis, script writing, carousel draft generation, and export caption generation.
- Do not track provider read/list calls, polling calls, or download-only calls.
- Keep provider API keys server-only and never include them in usage metadata.

## Task #4

Add admin usage APIs and dashboard.

- Add server functions for admin aggregate usage, usage event listing, default limit save, and per-user override save.
- Gate all admin usage APIs with the existing `admin` role.
- Add `/admin/api-usage`.
- Add an API Usage sidebar item for existing and new workspaces.
- Show summary metrics, daily usage chart, user usage table with limit editor, and event history table with filters.

Admin dashboard visual:

```text
+--------------------------------------------------------------------------------+
| API Usage                                           Period [Jul 2026 v] Refresh |
+--------------------------------------------------------------------------------+
| Used credits     Remaining credits     Users near cap     Blocked attempts      |
| 12,430           37,570                3                  8                     |
+--------------------------------------------------------------------------------+
| Daily usage                                                                    |
| [ line/bar chart by day, stacked by provider ]                                  |
+--------------------------------------------------------------------------------+
| Users                                      Search... Status Provider             |
| User                 Used / Limit       Remaining      Status      Override      |
| Tyler                840 / 1000         160            Warning     [1200] Save   |
| Alex                 1000 / 1000        0              Blocked     [1000] Save   |
+--------------------------------------------------------------------------------+
| Events                                      Provider  Feature  Status            |
| Jul 3 10:31  Tyler     Gemini       captions        success     2 credits       |
| Jul 3 10:20  Alex      Veo          ai_video        blocked     50 credits      |
+--------------------------------------------------------------------------------+
```

## Task #5

Add user-facing usage indicator and modal.

- Add a compact sticky-header indicator showing used credits and limit.
- Open a modal from the indicator.
- Show current period, remaining credits, progress state, and recent usage history.
- Allow all signed-in users to read only their own usage summary and history.
- Keep the modal compact rather than a full dashboard for regular users.

User modal visual:

```text
+----------------------------------------------+
| API Usage                                  X  |
+----------------------------------------------+
| July 2026                                    |
| 840 / 1000 credits used                      |
| [====================------] 160 left         |
| Status: Warning                              |
+----------------------------------------------+
| Recent usage                                 |
| Gemini captions          2 credits  Jul 3    |
| Veo video generation    50 credits  Jul 2    |
| OpenAI image            10 credits  Jul 1    |
+----------------------------------------------+
| Load more                                     |
+----------------------------------------------+
```

## Task #6

Wire usage alerts into the existing notification tray.

- Add an `api_usage_alert` notification type.
- Create deduped warning and cap notifications per user and period.
- Send threshold alerts to the affected user and admins.
- Render API usage alerts in the bell tray and Notifications dashboard.
- Keep feedback and creator-watch notifications unchanged.

## Product Behavior

- Admins are the superadmins for v1.
- Limits reset every UTC calendar month.
- Users see their own credits and recent usage only.
- Admins can monitor all users and set default or per-user monthly caps.
- Warning notifications are created at `80%`.
- Requests are rejected once the next billable action would exceed the monthly cap.

## Non-Goals

- No new `superadmin` role in v1.
- No dollar estimates in v1.
- No email or browser push alerts in v1.
- No user-managed limits in v1.
- No per-provider caps in v1.
- No configurable credit weights in v1.

## Rules

- Reuse existing dashboard, table, dialog, chart, notification, and settings patterns.
- Keep all enforcement server-side.
- Never expose provider secrets or raw provider responses in usage APIs.
- Keep one canonical limiter; do not keep the old actor generation limiter in parallel.
- Update architecture docs when the usage model lands.
- For browser-facing changes, validate live before marking complete.

## Test Plan

- Unit test credit period math, credit weights, threshold crossing, cap enforcement, and alert dedupe.
- Unit test user-scoped history cannot read another user's usage.
- Typecheck after schema/API changes.
- Run build after adding the route so route generation updates.
- Run targeted lint on new and changed usage, notification, and UI files.
- Browser-check admin dashboard, user modal, warning alert, hard block message, and notification tray behavior.

## The Review Checklist

[x] Edge cases handled
[x] Error paths handled
[x] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief

Plan saved from API usage dashboard discussion.

- `admin` is the superadmin role.
- Credits are deterministic action credits.
- V1 tracks billable AI actions only.
- Monthly limits use one default cap plus optional per-user overrides.
- Users get a header indicator and compact modal, not a full dashboard.
- Warnings appear at `80%`; new billable actions block at `100%`.

## What Changed

- Added canonical API usage persistence, migration, UTC monthly policy, fixed
  action-credit weights, cap enforcement, warning/block alert dedupe, and a
  default `1000` credit cap.
- Replaced the old actor image hourly limiter with the unified usage limiter
  and instrumented billable Gemini, OpenAI, Veo, ElevenLabs, script, carousel,
  caption, analysis, export, image, and video generation actions.
- Added user/admin usage server functions, admin dashboard route, sidebar item,
  sticky-header usage indicator, compact user modal, and API usage event
  filters.
- Moved default monthly credit editing into General Settings while keeping
  per-user overrides in the API Usage dashboard.
- Added `api_usage_alert` notifications to the bell tray and notifications
  dashboard.
- Added API usage architecture documentation and focused policy tests.
- Applied hard-cut cleanup so the limiter fails if the canonical default limit
  row is missing instead of using a compiled fallback.

## Validation

- `tsx --test src/server/api-usage-policy.test.ts`
- `npm run typecheck`
- Targeted `eslint` on new usage, notification, route, and UI files.
- `npm run build`
- Live browser check on `localhost:3004`: login, `/admin/api-usage`, default
  limit save, and the header usage modal.
- Hard-cut pass: removed compiled default-limit fallback; reran typecheck,
  targeted ESLint, policy test, and build.
- Added General Settings default credit save flow and reran focused validation.
