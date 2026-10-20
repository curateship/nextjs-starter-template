# Going live

Note's live address is `https://note.barelycompany.com`. Tyler chose it on
20 Oct 2026. It is on `barelycompany.com` with Trade, Personal, Video,
Fitness, Course and Project, so the zone, its https mode and the email domain
were already there, and Tyler had nothing to change at a registrar.

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to the other
  `barelycompany.com` apps. Tyler's pick, 20 Oct 2026.
- **Google sign-in off.** Tyler, 20 Oct 2026. People sign in with email and
  password.
- **No payments.** Tyler, 20 Oct 2026. `CUSTOM_SHELL_BILLING_ENABLED` is
  `false`.
- **Fresh start.** Tyler, 20 Oct 2026. Live begins with only his admin
  account. Nothing is copied from the Mac's local database, so local
  libraries, notes and test accounts stay local.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Note" (`sill86e3iyqafrmtazk53mwu`) on the German
  server.
- **Note Web** (`gaqliog3hnnyhx7tdgih3zt5`) answers on
  `https://note.barelycompany.com`. Build stage `web`.
- **Note Worker** (`am6pke5hxmkluo2ky11v3rli`) has no address. Build stage
  `worker`. It runs the `note-imports` worker (downloads, X posts, Analyse,
  emptying Trash) and the shell's own jobs, listed in `src/app/server-options.ts`.
- **Note DB** (`o6fpwrpa6xfddszyrqqpwpvj`), Postgres 18, no public port, user
  and database both `note`. Its address has no `sslmode` suffix because the
  link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** was set through Coolify's API and read back as `web` and
  `worker`, so Tyler did not set it by hand.
- **DNS:** `A note.barelycompany.com` → 46.224.177.156, proxied by Cloudflare.
  The zone's https mode is Full.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com`. Note has its own Resend key, "Note
  (barelycompany.com send only)", which can only send, and only from that
  domain. The sender is `Note <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `note`, in Western Europe near the server.
  Downloaded videos, covers, post pictures and avatars go there. Files are
  served from `https://note-media.barelycompany.com`, because Cloudflare's
  free certificate covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Note storage (note bucket only)".
  On 20 Oct 2026 it wrote, read and deleted a file in `note`, and `project` and
  `video` refused it.
- **The bucket's CORS rule** lets the browser send big files straight to the
  bucket: `PUT` only, from `https://note.barelycompany.com` only, header
  `content-type`, and `ETag` readable.
- **Turnstile:** the widget "Note", managed mode, for `note.barelycompany.com`.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/note/.env.live`, which git ignores and which exists only in
workspace-25. Pomodoro's `launch.md` explains what each one breaks when
missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Note DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://note.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://note.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 20 Oct 2026. Never change it: every saved key, the AI keys included, would become unreadable, and every Save from x.com button would stop working. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Note <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Note" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `note` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `false` |
| `APP` | `note`, build time, both |
| `WORKER_PACKAGES` | `ffmpeg yt-dlp`, build time, worker only |
| `WORKER_PIP_PACKAGES` | `curl_cffi`, build time, worker only |

`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is not set, because Note acts as one site.

## yt-dlp needs curl_cffi

Note downloads with `yt-dlp --impersonate chrome`
(`src/server/note/download.ts`). Alpine's `yt-dlp` package comes without
curl_cffi, the helper that lets it pretend to be Chrome, and Alpine 3.24 has
no package for curl_cffi. Without it every download stops with `Impersonate
target "chrome" is not available`. The root `Dockerfile` therefore has a
`WORKER_PIP_PACKAGES` setting, and Note's worker sets it to `curl_cffi`. The
repo's `docs/deployment.md` → "Extra programs in the worker" has the details.

## Deploying

In `apps/note`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://note.barelycompany.com/api/health`, then copies the local left menu
and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Checked before the first deploy

On Tyler's Mac on 20 Oct 2026, both images were built from the root
`Dockerfile` with the values above and run against an empty Postgres 18.

- **Website:** applied all 111 database changes, up to
  `0103_note_library_menu.sql`, then answered `{"status":"ok"}` and read
  healthy.
- **Worker:** read healthy, with no errors in its log. It had FFmpeg 8.1.2 and
  yt-dlp 2026.08.19, and with curl_cffi 0.16.3 a YouTube download test picked
  its video as the `nodeapp` user.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 20 Oct 2026 | `3640b0c0b` | web `fvzym8hximfz2hrhlnveuien` (574 s), worker `wwljhw6oekcgqoonssjqldlw` (523 s) | First launch. Both containers healthy; health `{"status":"ok"}`. Four AI keys written. `create-admin.mjs` made typham2@gmail.com a verified admin; Playwright signed in once, then `copy-menu.mjs` copied this Mac's admin and members' menus. All 18 left-menu and admin links opened. React error 418 showed on `/admin/users` only in a browser set to Tokyo time, the shell's server-in-UTC problem, not Note's. In a throwaway library, an X post imported with its text and counts, and a YouTube import failed on YouTube's bot check (below). The library was deleted. |

## YouTube refuses the server

On 20 Oct 2026 a YouTube import on live failed with "Sign in to confirm you're
not a bot". yt-dlp reached YouTube, so curl_cffi works, but YouTube turns away
downloads from the Hetzner server's address. The same video downloaded inside
the same image on Tyler's Mac. X posts are not affected: an X post imported on
live with its text, likes and reposts. Fixing YouTube needs either cookies from
a signed-in YouTube account or a proxy at a home address, and neither is set
up.
