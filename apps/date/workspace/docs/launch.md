# Going live

Date's live address is `https://date.barelycompany.com`. Tyler asked for it
on 24 Oct 2026. It is on `barelycompany.com` with Trade, Personal, Video,
Fitness, Course, Project and Note, so the zone, its https mode and the email
domain were already there, and Tyler had nothing to change at a registrar.

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to the other
  `barelycompany.com` apps. Tyler's pick, 24 Oct 2026.
- **Google sign-in off.** Tyler, 24 Oct 2026. People sign in with email and
  password.
- **No payments.** Tyler, 24 Oct 2026. `CUSTOM_SHELL_BILLING_ENABLED` is
  `false`.
- **Fresh start.** Tyler, 24 Oct 2026. Live begins with only his admin
  account. Nothing is copied from the Mac's local database, so local dating
  profiles, leads, paired phones and the sample data stay local.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Date" (`c2d5u4tyo4enblxccm9jdrsr`) on the German
  server.
- **Date Web** (`5jj7njinhnx6eruy8jyirkgl`) answers on
  `https://date.barelycompany.com`. Build stage `web`.
- **Date Worker** (`obj0mfcjfjhx79bro3at3amk`) has no address. Build stage
  `worker`. It needs no extra programs, so `WORKER_PACKAGES` is not set.
- **Date DB** (`qgmm1hiolawbjwhyq4ffhllh`), Postgres 18, no public port, user
  and database both `date`. Its address has no `sslmode` suffix because the
  link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** was set through Coolify's API and read back as `web` and
  `worker`, so Tyler did not set it by hand.
- **DNS:** `A date.barelycompany.com` → 46.224.177.156, proxied by Cloudflare.
  The zone's https mode is Full.

## The phone

The Date phone app asks for the server's address on its one screen. On live
that address is `https://date.barelycompany.com`. Pairing needs
`CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`, which is set on both resources.
`phone/phone-link.md` has the rest.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com`. Date has its own Resend key, "Date
  (barelycompany.com send only)", which can only send, and only from that
  domain. The sender is `Date <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `date`, in Western Europe near the server. Files
  are served from `https://date-media.barelycompany.com`, because Cloudflare's
  free certificate covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Date storage (date bucket only)".
  On 24 Oct 2026 it wrote, read and deleted a file in `date`, and `note` and
  `project` refused it.
- **The bucket's CORS rule** lets the browser send big files straight to the
  bucket: `PUT` only, from `https://date.barelycompany.com` only, header
  `content-type`, and `ETag` readable.
- **Turnstile:** the widget "Date", managed mode, for `date.barelycompany.com`.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/date/.env.live`, which git ignores and which exists only in
workspace-24. Pomodoro's `launch.md` explains what each one breaks when
missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Date DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://date.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://date.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 24 Oct 2026. Never change it: every saved key, the AI keys included, would become unreadable, and every paired phone would have to pair again. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Date <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Date" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `date` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `false` |
| `APP` | `date`, build time, both |

`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is not set, because Date acts as one site.

## Deploying

In `apps/date`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://date.barelycompany.com/api/health`, then copies the local left menu
and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
