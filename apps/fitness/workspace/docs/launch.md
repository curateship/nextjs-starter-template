# Going live

Fitness's live address is `https://fitness.barelycompany.com`. Tyler chose it
on 19 Oct 2026. It is on `barelycompany.com` with Trade, Personal and Video, so
Personal can show it in a panel.

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to Trade, Personal
  and Video. Tyler's pick, 19 Oct 2026.
- **Fresh start.** Live begins empty. Nothing is copied from the Mac's local
  database or bucket.
- **Payments off, Google sign-in off.** `CUSTOM_SHELL_BILLING_ENABLED` and the
  two Google values are not set. Tyler, 19 Oct 2026.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Fitness" (`a2v9ccjpxedg8zraqyffunqp`) on the German
  server. Its own project, as for every app.
- **Fitness Web** (`hy4xqsokqign22sitwgqaum4`) answers on
  `https://fitness.barelycompany.com`. Build stage `web`.
- **Fitness Worker** (`uiviv0vnxxh5wijywsc4f57r`) has no address. Build stage
  `worker`.
- **Fitness DB** (`aokuqnxme28hta1io6mq3nnz`), Postgres 18, no public port,
  user and database both `fitness`. Its address has no `sslmode` suffix
  because the link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** was set through Coolify's API
  (`dockerfile_target_build`) on 19 Oct 2026. It shows in Coolify → the
  resource → Configuration → Build → Docker Build Stage Target. Left empty,
  Docker builds the last stage in the file, which is the worker, on both.
- **DNS:** `A fitness.barelycompany.com` → 46.224.177.156, proxied by
  Cloudflare. The zone's https mode is Full.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com`, the Resend sending domain Video
  added on 18 Oct 2026. Fitness has its own key, "Fitness (barelycompany.com
  send only)", which can only send, and only from that domain. The sender is
  `Fitness <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `fitness`, in Western Europe near the server.
  Files are served from `https://fitness-media.barelycompany.com`. That is not
  `media.fitness.barelycompany.com` because Cloudflare's free certificate
  covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Fitness storage (fitness bucket
  only)". On 19 Oct 2026 it wrote, read and deleted a file in `fitness`, and
  `video` and `pomoder` refused it.
- **The bucket's CORS rule** lets the browser send files straight to the
  bucket, which the shell's big-upload feature (`docs/shell/big-uploads.md`,
  `src/server/media/video-upload.ts`) does. Set on 19 Oct 2026 through the
  Cloudflare API: `PUT` only, from `https://fitness.barelycompany.com` only,
  header `content-type`, and `ETag` readable. Local runs use their own bucket,
  so no local port is listed.
- **Turnstile:** the widget "Fitness", managed mode, for
  `fitness.barelycompany.com`.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/fitness/.env.live`, which git ignores and which exists only in
workspace-23. Pomodoro's `launch.md` explains what each one breaks when
missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Fitness DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://fitness.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://fitness.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 19 Oct 2026. Never change it: every saved key would become unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Fitness <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Fitness" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `fitness` bucket and its own key |
| `APP` | `fitness`, build time, both |

The worker needs no extra programs, so there is no `WORKER_PACKAGES`.

## Deploying

In `apps/fitness`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://fitness.barelycompany.com/api/health`, then copies the local left
menu and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Checked before the first deploy

On Tyler's Mac on 19 Oct 2026, both images were built from the root
`Dockerfile` with `APP=fitness` and run against an empty Postgres 18.

- **Website:** applied all 102 database changes, up to
  `0099_fitness_program_pictures.sql`, then answered `{"status":"ok"}` and
  read healthy.
- **Worker:** read healthy on its first try, with no errors in its log, so
  Fitness runs without the shell's `worker-drop-css.mjs`, which Video's worker
  needed. Fitness's `scripts/build-worker.mjs` is the older shell copy without
  that plugin, and it gets the plugin on its next shell merge.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 19 Oct 2026 | `2b752d223` | web `dmlmiicha0a0wrejrf9tcnx7` (554 s), worker `e3r9arwgszq74ai3dovjceri` (523 s) | First launch. The website went first and applied all 102 database changes, then the worker followed. Both read healthy, and the health address answered `{"status":"ok"}`. The four AI keys were written straight after. `create-admin.mjs` made typham2@gmail.com a verified admin. The first sign-in made the site, then `copy-menu.mjs` copied this Mac's admin and members' menus to live. |

### What the first live check covered, 19 Oct 2026

Playwright, signed in as Tyler, nothing pressed that changes data.

- **As a visitor:** the home page, `/register`, `/login` and
  `/forgot-password` load with no errors, and the page is a secure context.
  Plain `http://` redirects to `https://`.
- **The sign-up check:** the Turnstile script loads on `/register`. A real
  sign-up was not tried.
- **Signed in:** the `fitness_session` cookie is Secure and HttpOnly. Every
  left-menu link opens with no page errors and no failed requests: Programs,
  Exercises, Dashboard and its tabs, Pages, CRM, Broadcast, Automations and
  Settings. Settings → AI shows all four keys set. Programs at phone width
  (390 px) has no sideways scroll.
- **Found, not fixed:**
  - The tab title and the public home page still say "Custom Shell". The
    site's name and front page are saved settings, and a deploy copies only
    the menu.
  - At 1280 px wide, the admin dashboard's row of tabs (Dashboard to
    Referrals) ends at 1286 px, so every admin page scrolls sideways by 6 px.
    The row is the shell's.
- **Not yet tried on live:** making a program, logging a workout, a photo
  upload, an emailed link, and the calendar feed.
