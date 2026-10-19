# Going live

Project's live address is `https://project.barelycompany.com`. Tyler chose it
on 19 Oct 2026. It is on `barelycompany.com` with Trade, Personal, Video,
Fitness and Course, so the zone, its https mode and the email domain were
already there, and Tyler had nothing to change at a registrar.

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to the other
  `barelycompany.com` apps. Tyler's pick, 19 Oct 2026.
- **Google sign-in off.** Tyler, 19 Oct 2026. People sign in with email and
  password.
- **No payments.** Project is free, so `CUSTOM_SHELL_BILLING_ENABLED` is
  `false`.
- **Fresh start.** Tyler, 19 Oct 2026. Live begins with only his admin
  account. Nothing is copied from the Mac's local database, so Sample team,
  Ben Tester and the other test accounts stay local.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`. That account is the site admin who makes the teams.

## Where it runs

- **Coolify:** project "Project" (`h2fkwk8pvf8k7pultlnollxk`) on the German
  server.
- **Project Web** (`jpq3inydlkjofvn3a3algugr`) answers on
  `https://project.barelycompany.com`. Build stage `web`.
- **Project Worker** (`y0zxuxzqdszjyesiauc7b78m`) has no address. Build stage
  `worker`. It runs the check-in reminders, the planning jobs and the other
  background jobs listed in `src/app/server-options.ts`.
- **Project DB** (`qi7owchjxxin7stgfpb4fvnm`), Postgres 18, no public port,
  user and database both `project`. Its address has no `sslmode` suffix
  because the link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** was set through Coolify's API and read back as `web` and
  `worker`, so Tyler did not set it by hand.
- **DNS:** `A project.barelycompany.com` → 46.224.177.156, proxied by
  Cloudflare. The zone's https mode is Full.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com`. Project has its own Resend key,
  "Project (barelycompany.com send only)", which can only send, and only from
  that domain. The sender is `Project <hello@barelycompany.com>`. Invites and
  "Set your password" links go out through it.
- **Storage:** the R2 bucket `project`, in Western Europe near the server.
  Task files, team photos and avatars go there. Files are served from
  `https://project-media.barelycompany.com`, because Cloudflare's free
  certificate covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Project storage (project bucket
  only)". On 19 Oct 2026 it wrote, read and deleted a file in `project`, and
  `course` and `video` refused it.
- **The bucket's CORS rule** lets the browser send big files straight to the
  bucket: `PUT` only, from `https://project.barelycompany.com` only, header
  `content-type`, and `ETag` readable.
- **Turnstile:** the widget "Project", managed mode, for
  `project.barelycompany.com`. It is the human check on the join link.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/project/.env.live`, which git ignores and which exists only in
workspace-21. Pomodoro's `launch.md` explains what each one breaks when
missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Project DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://project.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://project.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 19 Oct 2026. Never change it: every saved key, the AI keys included, would become unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Project <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Project" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `project` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `false` |
| `APP` | `project`, build time, both |

`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is not set, because Project has no
workspaces. The worker needs no extra programs, so there is no
`WORKER_PACKAGES`.

## Deploying

In `apps/project`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://project.barelycompany.com/api/health`, then copies the local left
menu and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Checked before the first deploy

On Tyler's Mac on 19 Oct 2026, both images were built from the root
`Dockerfile` with `APP=project` and run against an empty Postgres 18.

- **Website:** applied all 124 database changes, up to
  `0120_project_team_avatar.sql`, then answered `{"status":"ok"}` and read
  healthy.
- **Worker:** read healthy, with no errors in its log.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 19 Oct 2026 | `8ad74f158` | web `shm976ahh9dcwkbnaaulazwh` (554 s), worker `vdtqnviwcj9ixbo4khrynglo` (535 s) | First launch. Both containers healthy; health `{"status":"ok"}`. Admin account made, four AI keys copied, left menu copied after the first sign-in. Playwright signed in as Tyler and opened all 20 left-menu links with no console errors, except React error 418 on Projects, Team and Task types while no team exists ("The server runs in UTC" above). Site name still reads "Custom Shell" in the browser tab. |

## The server runs in UTC

The live server's clock is UTC, while a visitor's browser is in their own
zone. A page the server draws must not show text that depends on the zone it
is drawn in, or React finds the server's text and the browser's different,
logs error 418 and redraws the page in the browser. On launch day two places
did that, and both are fixed:

- **The "Start a team" card's time zone box** read the browser's zone
  straight away, so it said UTC from the server and Toronto in the browser. It
  now reads UTC until the page is running, then the browser's own zone
  (`use-create-team.tsx`).
- **The team card's "Created Oct 16, 2026 · Toronto" line** was dated in
  whichever zone drew it. It is now dated in the team's own zone, the one it
  names (`team-dashboard.tsx`).

To check a page for this on the Mac, open it in Playwright with
`timezoneId: "Asia/Tokyo"`, because the Mac's server is in Toronto too and
hides it.
