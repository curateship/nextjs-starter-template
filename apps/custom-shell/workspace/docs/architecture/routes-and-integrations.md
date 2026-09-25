# Routes and integrations

The route tree separates signed-out pages, member pages, admin pages, and open
endpoints. TanStack Router builds the route table from these files. A route
loader checks access and loads the first page state before its component draws.

## Signed-out pages

The public routes are:

- `/` for the public home page.
- `/login`, `/register`, and `/sign-in-link` for account access.
- `/forgot-password` and `/reset-password` for password recovery.
- `/verify-email`, `/change-email`, and `/revoke-email-change` for email
  ownership changes.
- `/report-unwanted-sign-in` for a security report from an emailed link.
- `/pricing` for public plans.
- `/search` for public site search.
- `/maintenance` while the site is closed to non-admins.
- `/unsubscribe` for a signed contact unsubscribe link.
- The catch-all route for written pages, app pages, and the not-found view.
- `/robots.txt` and `/sitemap.xml` for search engines.

The `*.page.ts` files declare which ordinary public pages belong in the page
registry. Token routes and generated files are public endpoints for a specific
job, not editable public pages.

## Signed-in pages

Members can open `/home`, `/account`, `/workspaces`, and `/changelog`. Account
tabs may also open through the `account` search value while the person stays on
the current page. Admins use their configured home route instead of the member
home when one is set.

Admin routes sit under `/admin` and cover:

- Overview, Users, Workspaces, and Membership.
- Billing and Plans.
- Contacts and Segments.
- Newsletters, System emails, and Notifications.
- Announcements, Feedback, Media, and Pages.
- AI, Automations, and Traffic.
- Dev outbox and Settings.

Automation, newsletter, system-email, and settings routes have child addresses
for the open editor or tab.

## Open endpoints

- `/api/auth/google` starts Google OAuth and its callback completes it.
- `/api/v1/media/:mediaId/file` serves an allowed media object.
- `/api/v1/notifications/stream` carries notification update signals.
- `/api/v1/traffic/view` accepts the browser traffic beacon.
- `/api/webhooks/resend` and `/api/webhooks/stripe` receive signed provider
  events.
- `/api/health` reports whether the web container and database can answer.

Every open server function under `src/lib/api` appears in the server guard test
with the reason it must be reachable without a normal signed-in request. New app
server functions belong in that folder and must join the same checks. The app's
explicit open-function catalog is for exceptions only.

## External systems

Custom Shell can connect to these external systems:

- Postgres stores application records.
- R2 stores media objects.
- Stripe supplies checkout, subscriptions, and billing events.
- Resend supplies outbound email and delivery events.
- Google supplies optional OAuth.
- Anthropic, OpenAI, Gemini, and ElevenLabs supply optional AI models.

Each integration keeps its secret on the server, validates callbacks before
changing data, and records enough local state to explain later what happened.
