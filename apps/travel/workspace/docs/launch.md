# Going live

Travel's live address is `https://travel.barelycompany.com`. Tyler chose it on
3 Nov 2026. It sits on `barelycompany.com` with the other apps, so the zone,
its https mode and the email domain were already there, and Tyler had nothing
to change at a registrar.

## Decided

Tyler, 3 Nov 2026:

- **Server:** server1.barelycompany.com, 185.55.243.241, with every other app.
- **Google sign-in off.** People sign in with email and password.
- **No payments.** `CUSTOM_SHELL_BILLING_ENABLED` is `false`.
- **No Google Maps or Unsplash keys at launch** ("Go live without them"). Until
  they are added, the place field is plain text, the Map tab says the key is
  missing, there are no travel times, and a new trip gets no cover by itself.
  [Outside services](outside-services.md) lists the three keys. Add them in
  Coolify on Travel Web and Travel Worker. The server reads them on every call,
  so no redeploy is needed.
- **Local trips copied** ("Copy my local trips"). His Tokyo trip went across
  from the Mac's database with its cards, notes, activity types and photos.
  See "The trip copy" below.
- **First admin:** typham2@gmail.com, made by the deploy-app skill's
  `create-admin.mjs`.

## Where it runs

- **Coolify:** project "Travel" (`wiv9kedtsdbk3q6ka77xqtka`) on server1.
- **Travel Web** (`pydrsqnwxph6chs9mkmjlqfq`) answers on
  `https://travel.barelycompany.com`. Build stage `web`.
- **Travel Worker** (`2d3g2mzhrpej3137gatm4iga`) has no address. Build stage
  `worker`. It runs the shell's own jobs and needs no extra programs.
- **Travel DB** (`nufmzgsvjhlbedjyksycgbsv`), Postgres 18, no public port, user
  and database both `travel`. Its address has no `sslmode` suffix because the
  link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000, Git commit `HEAD`. Auto-deploy is off.
- **The build stage** was set through Coolify's API and read back as `web` and
  `worker`.
- **DNS:** `A travel.barelycompany.com` → 185.55.243.241, proxied by
  Cloudflare.

## Email, storage and the human check

- **Email:** sent from `barelycompany.com` with Travel's own Resend key,
  "Travel (barelycompany.com send only)", which can only send, and only from
  that domain. The sender is `Travel <hello@barelycompany.com>`.
- **Storage:** the R2 bucket `travel`, in Western Europe near the server. Trip
  covers, activity pictures and avatars go there. Files are served from
  `https://travel-media.barelycompany.com`, because Cloudflare's free
  certificate covers only one level below `barelycompany.com`.
- **The storage key** is the account token "Travel storage (travel bucket
  only)". On 3 Nov 2026 it wrote, read and deleted a file in `travel`, and
  `note` and `video` refused it.
- **The bucket's CORS rule:** `PUT` only, from
  `https://travel.barelycompany.com` only, header `content-type`, `ETag`
  readable.
- **Turnstile:** the widget "Travel", managed mode, for
  `travel.barelycompany.com`.

## Every value

All are run-time values in Coolify on both resources, except where the table
says otherwise. The live copies are in `apps/travel/.env.live`, which git
ignores and which exists only in workspace-27.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Travel DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://travel.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://travel.barelycompany.com`, website only |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 3 Nov 2026. Never change it, or every saved key, the AI keys included, becomes unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The sending key above, `Travel <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Travel" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `travel` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `false` |
| `APP` | `travel`, build time, both |
| `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `UNSPLASH_ACCESS_KEY` | Not set yet |

`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is not set, because Travel acts as one
site.

## The trip copy

Live started with only Tyler's admin account. Straight after it was made, and
before anyone signed in, a one-off script copied his trips from the Mac's
database into it:

- **What went across:** his trips, their cards and notes, his six activity
  types with their ids kept (the cards point at them), and the row that says he
  already had the Tokyo sample. Without that row, his first visit would add a
  second Tokyo trip, and without the types it would add a second set of
  defaults.
- **Photos:** every picture on the local bucket was read from its public
  address and written into the `travel` bucket, and every address in the
  copied rows was changed to `travel-media.barelycompany.com`. A picture sits
  in a folder named after its account, so the local account's id in each path
  became the live account's id. The script refused to copy if
  any local address was left.
- **Refuses doubles:** it stops and copies nothing if live already has trips,
  types or the sample row for him.

## Deploying

In `apps/travel`, type `npm run deploy`. It pushes the branch to `develop`,
builds the website then the worker on Coolify, checks
`https://travel.barelycompany.com/api/health`, then copies the live left menu
down to this Mac. It never writes the live menu or the AI keys, which went in
once at launch. Add `-- --dry-run` to see the plan first. The deploy-app skill
has the rest.

## Checked before the first deploy

On Tyler's Mac on 3 Nov 2026, both images were built from the root
`Dockerfile` with `APP=travel` and run against an empty Postgres 18. Both read
healthy, the website answered `{"status":"ok"}`, Travel's newest tables
(`0101_travel_day_part.sql`, `0102_travel_trip_bin.sql`) were there, and
neither log had an error.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 4 Nov 2026 | `612a0f792` | web `tmpf8l55hjlvdv3wyyxpkpnq` (1305 s), worker `t9ceyu9j26w4iprvb36yqcv1` (1067 s) | First launch. The first try failed on server1 when Alpine's package mirror didn't resolve ("DNS: transient error"); the second built. Both containers healthy; health `{"status":"ok"}`. `create-admin.mjs` made typham2@gmail.com a verified admin. The trip copy moved 1 trip, 22 cards, 1 note, 6 activity types, the sample marker and 8 photos. Four AI keys written. Playwright at 1440 wide signed in, saw one "Tokyo, 5 days" in the Trips table, opened it with its cards, and all six pictures on screen loaded from `travel-media`; `/admin/users` listed the admin. The map shows its missing-key notice, as expected with no Google key. The worker added Travel → Trips to the live menu within a minute of the first sign-in. The menu copy after the deploy crashed when the database link dropped and left the database's temporary public port open. It was closed by hand within minutes, and `live-db.mjs` now catches a dropped link so the port always closes. The live menu has not been copied to this Mac yet, because it differs from the local one. |
