# Going live

Course's live address is `https://systemeverything.com`, on the US Hetzner
server, 5.78.189.158. Tyler, 31 Oct 2026: "launch app to systemeverything.com
on the US based server", "We're not using the old hub app anymore. We just need
to backup systemeverything and eatdrinktoronto and deploy course with just
systemeverything.com".

The first launch, on 19 Oct 2026, put Course on `https://course.barelycompany.com`
on the German server. That copy is still running and nothing on it was changed.
Its record is the German sections further down.

## The US launch, 31 Oct 2026

- **Started empty.** Nothing came across from the German copy or the old
  System Everything site. Tyler picked "New US launch, empty".
- **Same choices as the German launch.** One website, no
  `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN`. Payments on with the Stripe keys owed,
  Google sign-in off.
- **Only systemeverything.com.** Course Web answers on `systemeverything.com`,
  and `www.systemeverything.com` forwards to it.
- **The old System Everything App is stopped**, so `hub.systemeverything.com`,
  `eatdrinkto.com` and `eatdrinktoronto.com` no longer answer. Coolify could not
  restart it without systemeverything.com: the restart picked up a newer image
  that failed its health check, and Coolify put the old container back, still
  holding the address. Tyler chose to stop it on 31 Oct 2026. Never press
  Redeploy on it, because it would build today's `develop`.
- **Coolify:** project "Course" (`j9i2wofkw22qalyayw9rld0w`) on the US server.
  Course Web `pa1b5m2sh32735gbmxmc9kbl`, Course Worker
  `dkut5awwx90heyq62qews9y0`, Course DB `rw8qnp3xd1t2gqdzlxocevrk` (Postgres
  18, no public port, user and database `course`).
- **The build stage:** the US Coolify refuses `dockerfile_target_build` through
  its API, so it is set by hand in Coolify, `web` on Course Web and `worker` on
  Course Worker.
- **Email:** sent from `System Everything <hello@systemeverything.com>`, with
  the send-only Resend key "Course (systemeverything.com send only)". The
  domain was already verified in Resend for the old site.
- **Storage:** the R2 bucket `course-us`, near the US server, served from
  `https://media.systemeverything.com`. Its own key is "Course storage
  (course-us bucket only)". On 31 Oct 2026 it wrote, read and deleted a file,
  and the `course` bucket refused it. The bucket accepts browser uploads by
  `PUT` from `https://systemeverything.com` only.
- **Turnstile:** the widget "Course (systemeverything.com)".
- **The live values** are in `apps/course/.env.live`. The German copy's values
  moved to `apps/course/.env.live.de`. Both files are gitignored and exist only
  in workspace-20.
- **Deploying:** `npm run deploy` in `apps/course` now deploys the US copy. The
  German copy is `course-de` in the deploy-app skill's `apps.json`, deployed with
  `node .agents/skills/deploy-app/scripts/deploy.mjs course-de --skip-menu` from
  the worktree's top folder.

## The old site's backup

Taken on 31 Oct 2026, before systemeverything.com moved, in
`~/Backups/systemeverything-2026-10-31/` on Tyler's Mac.

- **`postgres.dump`** is the whole database of "System Everything DB", 69
  tables and 10 MB. It holds the System Everything, Eat Drink Toronto, Eat
  Drink Saigon and Marketplace Theme sites, 25,460 newsletter contacts and
  3,333 directory entries. Restore it with `pg_restore`.
- **Left out:** the `drizzle` schema, which only lists the old app's applied
  migrations. The database's own user cannot read it.
- **Not touched:** the old site's files are in the R2 bucket
  `system-everything`, which stays as it is.

# The German copy, 19 Oct 2026

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to Trade, Personal,
  Video and Fitness. Tyler's pick, 19 Oct 2026.
- **One website for now.** `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is not set, so
  the deployment answers as one site, the way `sites.md` describes. Setting it
  to `course.barelycompany.com` would put each site on
  `<site>.course.barelycompany.com`, two levels down, which Cloudflare's free
  certificate does not cover.
- **Payments on, Google sign-in off.** Tyler, 19 Oct 2026.
  `CUSTOM_SHELL_BILLING_ENABLED` is `true`. The Stripe keys are not on the
  server. They go into the live Settings → Billing, which saves them encrypted
  in the database, and Stripe's webhook must point at
  `https://course.barelycompany.com/api/webhooks/stripe`.
- **Fresh start.** Live begins empty. Nothing is copied from the Mac's local
  database or bucket, and the 25,100 old contacts are not imported
  (`importing-the-old-contact-list.md`).
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Course" (`pok3ckcrdimbqyfyplgbrknd`) on the German
  server.
- **Course Web** (`x8ockgtzr0tukuel2gdtf6mw`) answers on
  `https://course.barelycompany.com`. Build stage `web`.
- **Course Worker** (`ze72p6mtkabxou28ifiypert`) has no address. Build stage
  `worker`.
- **Course DB** (`jee1uxx0iazkaw78y7yqtyhf`), Postgres 18, no public port,
  user and database both `course`. Its address has no `sslmode` suffix
  because the link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** was set through Coolify's API on 19 Oct 2026, and it
  read back as `web` and `worker`. Earlier launches had to set it by hand.
- **DNS:** `A course.barelycompany.com` → 46.224.177.156, proxied by
  Cloudflare. The zone's https mode is Full.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com`, the Resend sending domain Video
  added on 18 Oct 2026. Course has its own key, "Course (barelycompany.com
  send only)", which can only send, and only from that domain. The sender is
  `Course <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `course`, in Western Europe near the server.
  Files are served from `https://course-media.barelycompany.com`, not
  `media.course.barelycompany.com`, because Cloudflare's free certificate
  covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Course storage (course bucket
  only)". On 19 Oct 2026 it wrote, read and deleted a file in `course`, and
  `fitness` and `video` refused it.
- **The bucket's CORS rule** lets the browser send big files straight to the
  bucket: `PUT` only, from `https://course.barelycompany.com` only, header
  `content-type`, and `ETag` readable.
- **Turnstile:** the widget "Course", managed mode, for
  `course.barelycompany.com`.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/course/.env.live`, which git ignores and which exists only in
workspace-20. Pomodoro's `launch.md` explains what each one breaks when
missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Course DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://course.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://course.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 19 Oct 2026. Never change it: every saved key, Stripe's included, would become unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Course <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Course" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `course` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `true` |
| `APP` | `course`, build time, both |

The worker needs no extra programs, so there is no `WORKER_PACKAGES`.

## Deploying

In `apps/course`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://course.barelycompany.com/api/health`, then copies the local left
menu and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 31 Oct 2026 | `a8f1c7247` | web `ylzc0una3xyowxm3d3wl7ume` (245 s), worker `fct46flkhianic22utd6zh0e` (222 s) | US launch on systemeverything.com. Health `{"status":"ok"}`. Admin account made, four AI keys copied, left menu copied after the first sign-in. Playwright signed in, opened the dashboard and Users with no console errors. Stripe keys and webhook (`https://systemeverything.com/api/webhooks/stripe`) owed. |
| 19 Oct 2026 | `33e80add6` | web `5rkbywzchwo2grkbuxpmgkax` (565 s), worker `dvhgwy0yfcfycoekgvfjq0us` (523 s) | First launch. Health `{"status":"ok"}`. Admin account made, four AI keys copied, left menu copied after the first sign-in. Every left-menu link opened in Playwright with no console errors. Stripe keys and webhook owed. |

## Checked before the first deploy

On Tyler's Mac on 19 Oct 2026, both images were built from the root
`Dockerfile` with `APP=course` and run against an empty Postgres 18.

- **Website:** applied all 97 database changes, up to `0094_courses.sql`,
  then answered `{"status":"ok"}` and read healthy.
- **Worker:** read healthy on its first try, with no errors in its log.
