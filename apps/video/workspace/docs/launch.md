# Going live

Video's live address is `https://video.barelycompany.com`. Tyler chose it on
18 Oct 2026. It is on `barelycompany.com` with Trade and Personal, so Personal
can show it in a panel.

## Decided

- **Server:** the German Hetzner box, 46.224.177.156, next to Trade and
  Personal. Tyler's pick, 18 Oct 2026.
- **Fresh start.** Live began empty. Nothing was copied from the Mac's local
  database or bucket. Tyler, 18 Oct 2026.
- **Creator watching off.** `VIDEO_WATCH_ENABLED` is not set, so the worker
  never checks followed creators for new posts by itself. Setting it to `1` on
  Video Worker and restarting switches it on. Tyler, 18 Oct 2026.
- **Payments off, Google sign-in off.** `CUSTOM_SHELL_BILLING_ENABLED` and the
  two Google values are not set. Tyler, 18 Oct 2026.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Video" (`ot9tnvtaiex52ewyttmuhpi8`) on the German
  server. Its own project, as for every app.
- **Video Web** (`x9xjideeh5zv8xa8vh80szvo`) answers on
  `https://video.barelycompany.com`. Build stage `web`.
- **Video Worker** (`uzeo56eu7x1gnqbqb4mwugvu`) has no address. Build stage
  `worker`.
- **Video DB** (`cms4hc61idk3pxmalek6vws2`), Postgres 18, no public port, user
  and database both `video`. Its address has no `sslmode` suffix because the
  link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off.
- **The build stage** is set by hand in Coolify → the resource →
  Configuration → Build → Docker Build Stage Target. The API refuses the
  field. Left empty, Docker builds the last stage in the file, which is the
  worker, on both.
- **DNS:** `A video.barelycompany.com` → 46.224.177.156, proxied by
  Cloudflare. The zone's https mode is Full.

## Email, storage and the human check

- **Email:** `barelycompany.com` is a Resend sending domain (US East, id
  `dda896e8-7a9c-4791-992d-4a518746874c`), added 18 Oct 2026 with its four
  records in Cloudflare, all DNS only. Any app on `barelycompany.com` can send
  from it. Video's key can only send, and only from that domain. The sender is
  `Video <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `video`, in Western Europe near the server. Files
  are served from `https://video-media.barelycompany.com`. That is not
  `media.video.barelycompany.com` because Cloudflare's free certificate covers
  only one level below `barelycompany.com`.
- **The storage key** is the account token "Video storage (video bucket only)".
  On 18 Oct 2026 it wrote, read and deleted a file in `video`, and `pomoder` and
  `nodabot` refused it.
- **The bucket has no CORS rule.** Video uploads through its own server today.
  The shell's big-upload feature (`docs/shell/big-uploads.md`) sends files
  straight from the browser to the bucket. When a shell merge brings it to
  Video, the bucket needs that doc's CORS rule first.
- **Turnstile:** the widget "Video", managed mode, for
  `video.barelycompany.com`.

## Every value

All of these are run-time values in Coolify on both resources, never build
time, except where the table says otherwise. The live copies are in
`apps/video/.env.live`, which git ignores. Pomodoro's `launch.md` explains what
each one breaks when missing.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Video DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://video.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://video.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 18 Oct 2026. Never change it: every saved key would become unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Video <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Video" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `video` bucket and its own key |
| `APP` | `video`, build time, both |
| `WORKER_PACKAGES` | `ffmpeg yt-dlp`, build time, worker only |

The worker calls `ffmpeg`, `ffprobe` and `yt-dlp`. Alpine's `ffmpeg` package
brings `ffprobe` with it. The YouTube key for Viral search is pasted in
Settings → YouTube after launch, not set as `VIDEO_YOUTUBE_API_KEY`.

## Deploying

In `apps/video`, type `npm run deploy`. It pushes the branch to `develop`,
builds both resources on Coolify, checks
`https://video.barelycompany.com/api/health`, then copies the local left menu
and Tyler's AI keys to live. Add `-- --dry-run` to see the plan first. The
deploy-app skill has the rest.

## Checked before the first deploy

On Tyler's Mac on 18 Oct 2026, both images were built from the root
`Dockerfile` with the values above and run against an empty Postgres 18.

- **Website:** applied all 131 database changes, up to
  `0116_video_creator_post_covers.sql`, then answered `{"status":"ok"}` and
  read healthy.
- **Worker, first try:** it died on its first line with `Unknown file
  extension ".css"` for the image cropper's stylesheet. Settings → Scripts
  (`src/app/options.ts`) points at a panel that reaches the shell layout and
  the cropper. The fix is the shell's `scripts/worker-drop-css.mjs`, copied
  into Video unchanged. `docs/deployment.md` → "No stylesheets in the worker"
  explains it.
- **Worker, after the fix:** healthy, with no errors in its log, FFmpeg 8.1.2,
  ffprobe 8.1.2 and yt-dlp 2026.08.19.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 18 Oct 2026 | `e46bb5d10` | web `dhxa4k3aleyzm5ltthfnm1qs` (532 s), worker `euyo45ozmqrw9wpi6bwsadx5` (513 s) | First launch. The website went first and applied all 131 database changes, then the worker followed. Both read healthy, and the health address answered `{"status":"ok"}`. The four AI keys were written straight after. `create-admin.mjs` made typham2@gmail.com a verified admin. The first sign-in made the site, then `copy-menu.mjs` copied this Mac's admin and members' menus to live. |

### What the first live check covered, 18 Oct 2026

Playwright, signed in as Tyler, nothing pressed that changes data.

- **As a visitor:** the home page and `/register` load with no errors, and the
  page is a secure context. Plain `http://` redirects to `https://`.
- **The sign-up check:** the Turnstile script loads on `/register` and
  `/forgot-password` and talks to Cloudflare. A real sign-up was not tried.
- **Signed in:** the session cookie is Secure and HttpOnly. Video editor,
  Actors, Exports, Carousels, Viral, Favourites, CRM, Pages, Broadcast,
  Automations and Settings all open with no page errors and no failed
  requests. Settings → AI shows all four keys set, and Settings → Scripts and
  Settings → YouTube open.
- **The left menu** matches this Mac: Navigation (Dashboard, Video editor with
  Actors and Exports, Carousels, Viral) and Platform (CRM, Pages, Broadcast,
  Automations, Settings). Every link opens.
- **Found, not fixed:**
  - The tab title and the public home page still say "Custom Shell". The
    site's name and front page are saved settings, and a deploy copies only
    the menu.
  - `/admin/users` throws React error 418, a page drawn differently on the
    server and in the browser.
  - At phone width, the Projects search box is squashed under the "All
    projects" button.
- **Not yet tried on live:** an upload, an export, an emailed link, and a
  Viral search, which needs the YouTube key pasted first.
