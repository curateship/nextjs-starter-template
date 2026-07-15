# Deployment runbook

## Coolify services

Build `apps/pomoder/Dockerfile` from the repository root.

- Web command: `node .output/server/index.mjs`
- Worker command: `npm run worker`
- Release command: `npm run db:migrate`
- Web health check: `/api/health/live`
- Readiness check: `/api/health/ready`

Both services share PostgreSQL, R2, provider, Stripe, Resend, and Sentry environment settings. Disable proxy buffering for `/api/rooms/*/events` and allow long-lived responses.

## Rollout

1. Deploy to staging with billing, rooms, and AI flags off.
2. Apply migrations, start worker, then web; confirm live/ready checks and logs.
3. Smoke-test guest timer, auth, persistent tasks, Stripe test checkout, uploads, a two-user room, and provider generation.
4. Enable one feature flag at a time and monitor errors, latency, queue age, webhooks, phase lag, and generation refunds.
5. Promote the same image to production. Remove each temporary flag within two weeks of full rollout.

Rollback uses the previous image and disables feature flags. Never reverse a destructive database migration; restore a snapshot or ship a forward repair. Launch remains blocked until owner-approved Terms and Privacy copy replaces the placeholders.
