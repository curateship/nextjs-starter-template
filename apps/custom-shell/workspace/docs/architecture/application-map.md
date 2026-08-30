# Application map

Custom Shell is both a working SaaS application and the shared base for Trade,
CMS, and Video. It owns accounts, workspaces, billing, navigation, settings,
email, notifications, media, feedback, public pages, and automations. Each app
adds product routes, widgets, automation nodes, workers, and public content
through the shell configuration instead of copying shell code.

## Route groups

The route tree has three clear audiences:

- Signed-out routes cover registration, sign in, password recovery, email
  verification, pricing, public search, maintenance, and published pages.
- Member routes cover Home, Account, Workspaces, Changelog, and any app pages
  allowed by the active role.
- Admin routes cover people, billing, content, communication, feedback, media,
  AI, automations, traffic, and platform settings.

API routes handle OAuth callbacks, media files, notification updates, traffic
beacons, health checks, and provider webhooks. Page routes do not contain the
business rules for those systems.

## Main layers

The main source folders have distinct jobs:

- `src/routes` loads a page and checks who may open it.
- `src/components` draws the screen and keeps local interaction state.
- `src/server` owns database access, permissions, provider calls, and
  background work.
- `src/lib` holds contracts and shared browser-safe helpers.
- `src/app` is the app-owned extension point.

The database schema is in `src/server/schema.ts`. It tracks:

- Accounts, sessions, workspaces, plans, and subscriptions.
- Automation definitions and runs.
- Media, feedback, contacts, and segments.
- Broadcasts, system emails, and notifications.
- Public content, AI usage, and traffic records.

## App extension points

The app extension files split browser and server work:

- `src/app/options.ts` supplies browser-safe app choices such as navigation,
  dashboard widgets, search results, automation nodes, and extra settings tabs.
- `src/app/server-options.ts` supplies automation executors and background
  workers.
- Public pages use routes with a matching `*.page.ts` declaration.

The shell filters navigation on the server and again in the browser before
drawing it.

Shared ownership rules live in the repo's `docs/shell/shell-and-apps.md` and
`docs/shell/what-lives-where.md`. Security rules live in
`docs/shell/security.md`. Those files are the authority when an app and the
shell meet.
