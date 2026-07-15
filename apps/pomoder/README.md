# Pomoder

Pomoder is a dark, calm Pomodoro SaaS with local guest use, synchronized tasks and focus history, chat-only focus rooms, custom media, Stripe Pro subscriptions, and AI-generated focus backgrounds and soundscapes.

## Quick start

```bash
cp .env.example .env.local
npm run db:setup
npm run dev
```

The app runs at the URL derived from its assignment in `local-apps.json`. Development database setup creates the `pomoder` database and applies journaled Drizzle migrations; it does not seed credentials.

Create or elevate an administrator by temporarily setting `POMODER_ADMIN_EMAIL` and `POMODER_ADMIN_PASSWORD`, then running `npm run admin:create`. Remove the password immediately afterward. The admin dashboard is available at `/admin`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the web app |
| `npm run worker` | Start jobs and scheduled room transitions |
| `npm run db:migrate` | Apply pending migrations |
| `npm run admin:create` | Create or elevate an administrator |
| `npm test` | Run unit/integration tests |
| `npm run test:e2e` | Run browser/accessibility tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript |
| `npm run build` | Build the production server |

## Architecture

- TanStack Start/Router, React, Tailwind, Nitro.
- PostgreSQL and Drizzle for product state; pg-boss for durable jobs.
- R2 for private uploads and generated media.
- Stripe Checkout/webhooks/Customer Portal for subscriptions.
- PostgreSQL `LISTEN/NOTIFY` and SSE for rooms.
- Gemini Veo and ElevenLabs for optional Pro generation.
- Resend REST API for verification and password-reset email.

See `docs/architecture-overview.md`, `docs/security.md`, and `docs/deployment.md` for contracts and operational details.
