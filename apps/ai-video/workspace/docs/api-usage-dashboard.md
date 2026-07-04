# API Usage Dashboard

AI Video uses deterministic action credits for billable provider calls.
Admin dollar estimates multiply displayed credits by the editable global
cost-per-credit rate. Estimates are informational only.

## Model

- Monthly periods use UTC calendar months.
- The default monthly cap is stored in `api_usage_limits` under `default`.
- The estimated cost-per-credit rate is stored in the global shell settings JSON
  and defaults to `$0.01`.
- If that row is missing, usage APIs fail and operators should run the latest
  database migrations.
- User overrides are stored in `api_usage_limits` under `user:{userId}`.
- Usage events store user, provider, feature, model, credits, status, period,
  safe metadata, and creation time.
- Blocked requests create `blocked` events but do not call the provider.
- Provider attempts that fail after a provider call are marked `failed`.

## Enforcement

All billable actions must call `withApiUsage(userId, action, run)` before making
the provider request. The limiter checks the current month under a per-user
database advisory lock, records the event, and rejects calls that would exceed
the cap.

## Alerts

Usage alerts dedupe by user, period, and alert level. Warning alerts fire at
80% and blocked alerts fire when usage reaches the cap or a blocked request is
attempted. Alerts create `api_usage_alert` notifications for the affected user
and admins.

## UI

Admins use General Settings to update the default cap and estimated
cost-per-credit rate. `/admin/api-usage` shows aggregate usage, user overrides,
events, and informational estimated costs. Signed-in users use the sticky-header
indicator to view their current credits and recent usage.
