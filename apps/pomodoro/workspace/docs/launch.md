# Launching Pomodoro

Pomodoro goes live as two Coolify resources built from one commit: the website
and the worker. The repo's `docs/deployment.md` is the recipe every app
follows. This page lists what Pomodoro in particular needs, who supplies each
value, and what has been proven so far.

## Decided

- **Fresh start.** No earlier Pomoder site is live on the domain, so there are no members or data to bring over. Tyler, 8 Oct 2026.
- **Server:** the Hetzner US server (5.78.189.158) for the database and both
  resources, deployed through the Coolify on that server (port 8000). Trade
  left the US server for the German one in August. The US server is retired
  for Trade only, not for Pomodoro. Tyler, 8 Oct 2026.
- **Coolify project:** "Pomoder", its own project. Tyler, 8 Oct 2026: each app
  gets its own project, because everything in "System Everything" is out of
  date.
- **Database:** "Pomoder DB", a Postgres 18 created 8 Oct 2026 in that
  project. It has no public port, so only containers on the US server can
  reach it. The System Everything database was not used, because its SSL is
  off and turning it on would restart the live System Everything site.
- **First admin:** typham2@gmail.com. Tyler, 8 Oct 2026.
- **Domain:** flowfly.app since 29 Oct 2026, and the app is called Flowfly.
  Tyler bought it at Namecheap that day and picked "Domain and name
  together". See "The move to flowfly.app" below. Before that the domain was
  pomoder.com. Tyler, 8 Oct 2026. It's registered at Namecheap,
  and on 8 Oct its DNS was Namecheap's own (`dns1.registrar-servers.com`),
  showing a parking page, with Namecheap email forwarding (MX `eforward*`) and
  its SPF record.
- **Accounts:** Resend and Google sign-in both belong to typham2@gmail.com.
  Tyler, 8 Oct 2026.
- **No Google sign-in at launch.** Tyler, 8 Oct 2026: "forget about the google
  sign in for now". The two Google values stay unset, so the sign-in pages
  show email and password only. Adding it later is two values on both
  resources plus a restart.
- **DNS moved to Cloudflare** by Tyler on 8 Oct 2026. The nameservers are
  `colin.ns.cloudflare.com` and `nia.ns.cloudflare.com`.
- **Resend:** pomoder.com was added as a sending domain on 8 Oct 2026 (US East,
  id `848e712d-149e-41c7-a5fd-0d3ae5d5c97c`). It needs these records in
  Cloudflare, all **DNS only** (grey cloud). All four were added and Resend
  verified the domain on 8 Oct 2026:
  - TXT `resend._domainkey`, the DKIM key Resend shows for the domain
  - MX `send`, priority 10, `feedback-smtp.us-east-1.amazonses.com`
  - TXT `send`, `v=spf1 include:amazonses.com ~all`
  - CNAME `rsend`, `send.forge.rmta.net`
- **Turnstile:** widget "Pomoder" for pomoder.com, managed mode, created
  8 Oct 2026. Both keys are in `apps/pomodoro/.env.live`.
- **R2:** bucket `pomoder`, stored in Western North America near the US
  server, created 8 Oct 2026. Its public address is `https://media.pomoder.com`,
  connected the same day. The live key is the account token "Pomoder storage
  (pomoder bucket only)", made through the API on 8 Oct 2026. It wrote, read
  and deleted a test file in `pomoder`, and `nodabot` and `system-everything`
  refused it. It replaced a first key that could write to every bucket, and
  both resources were restarted onto it and read healthy. The shell saves full addresses for some
  files (profile photos, page images), so changing the address later would
  break them. Uploads go through the server (`src/server/media/storage.ts`),
  and nothing plays media through the Web Audio API, so the bucket needs no
  CORS rule. The other apps' buckets use a public `r2.dev` address, which
  Cloudflare limits and means for development.
- **Sender:** `Pomoder <hello@pomoder.com>`, to change if Tyler wants another
  address. The key and sender are in `apps/pomodoro/.env.live`.

## The two resources

| | Web | Worker |
| --- | --- | --- |
| Dockerfile | root `Dockerfile` | root `Dockerfile` |
| Build target | `web` | `worker` |
| Build arguments | `APP=pomodoro` | `APP=pomodoro`, `WORKER_PACKAGES=ffmpeg` |
| Port | 3000 | none |
| Health check | built in (`/api/health`) | built in (heartbeat and database) |

The worker needs `WORKER_PACKAGES=ffmpeg`. Without it, every uploaded clip or
sound, and every AI background and soundscape, stops at "Sound and video
cannot be prepared yet." The website never runs FFmpeg, so it does not take
the argument.

The worker runs five jobs every 15 seconds: the rooms' clock, booked rooms,
upload conversions, AI generations and the evening streak reminder. Without
the worker, a room's phase only moves while someone has it open, and nothing
else on that list happens at all.

## Every value, where it comes from, who supplies it

Set these on both resources unless the table says otherwise. Every value here
is runtime only in Coolify (build time off). `APP` and `WORKER_PACKAGES` are
the only build-time values, because a build-time value is recorded in the
image's history. Tyler supplies
every key. None is guessed, and none is a build argument, because build
arguments can be read by anyone who can pull the image.

| Value | Where it comes from | Missing means |
| --- | --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Pomoder DB's internal address, kept in `apps/pomodoro/.env.live` (gitignored, never committed). It has no `sslmode` suffix: the link stays inside the US server, so nothing crosses the internet. A database on another machine would need `?uselibpqcompat=true&sslmode=require`. | Nothing starts. On purpose. |
| `CUSTOM_SHELL_APP_URL` | The public address, `https://<the domain>` | Production refuses to send any email, because every link would point at `localhost`. |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://pomoder.com,https://www.pomoder.com`, web only | Every form submission is refused with "Invalid origin". Sign-in, sign-up and every save fail with "We could not complete that request." Setting `CUSTOM_SHELL_APP_URL` alone is not enough (`getAllowedOrigins` in `src/server/auth/origin.ts`). |
| `CUSTOM_SHELL_API_ENV` | `production` | Without it, the laptop addresses (`localhost` on the dev port) stay on the allowed list in production. |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | A new random string, made once with `openssl rand -base64 32`, kept by Tyler. The same value on both resources. | Nothing secret can be saved: the AI keys, an email key or storage keys typed into Settings are refused with `ENCRYPTION_NOT_CONFIGURED`, so the AI generators never work. Changing it later makes every saved key unreadable, and the only fix is pasting each one again. The worker needs the same value, because it reads the AI keys. |
| `CUSTOM_SHELL_RESEND_API_KEY` | Resend, for Pomodoro's own sending domain. It can instead be saved later in Settings → Email. | Sign-up says "Email delivery is not configured yet." and nobody can register. |
| `CUSTOM_SHELL_EMAIL_FROM` | An address on the domain verified in Resend, such as `Pomoder <hello@<the domain>>` | Emails go out from Resend's testing sender, which only delivers to the Resend account's own inbox. |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | Cloudflare Turnstile, a widget for the domain | No "are you a human" check on sign-up. Set these before email, so the open sign-up form is never without it. |
| `CUSTOM_SHELL_GOOGLE_CLIENT_ID`, `CUSTOM_SHELL_GOOGLE_CLIENT_SECRET` | A Google Cloud OAuth client, with `https://<the domain>/api/auth/google/callback` as its redirect address | No "Sign in with Google" button. Email and password still work. |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `CUSTOM_SHELL_R2_ACCESS_KEY_ID`, `CUSTOM_SHELL_R2_SECRET_ACCESS_KEY`, `CUSTOM_SHELL_R2_BUCKET_NAME`, `CUSTOM_SHELL_R2_PUBLIC_URL` | A Cloudflare R2 bucket for Pomodoro alone. They can instead be saved later in Settings → General → Cloudflare R2. | Uploads and AI files have nowhere to go. |

Left unset on purpose:

- `CUSTOM_SHELL_BILLING_ENABLED`, so payments stay off. The payments tasks
  switch them on.
- `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN`. Pomodoro answers on one address.
- The Gemini and ElevenLabs keys. These go in Settings → AI after launch,
  where they are saved encrypted. Gemini makes the AI backgrounds (Veo) and
  ElevenLabs the soundscapes.

## The site must be served over HTTPS

The timer will not run on a plain `http://` address. The browser only offers
the random-ID maker the timer uses (`crypto.randomUUID`) on a secure page,
which means HTTPS, or `localhost` on a laptop. On plain HTTP the Start button
does nothing and the browser logs "crypto.randomUUID is not a function". The
dry run below hit exactly this. Cloudflare in front of the domain provides
HTTPS, so the live site is safe, but a test copy on a bare IP address is not.

## Releasing, in order

1. Create Pomodoro's own database and its own R2 bucket. Nothing is shared
   with another app. The database is done: Pomoder DB, 8 Oct 2026.
2. Create the web resource with every value above, and deploy it. It applies
   all the database changes on the way in, then serves.
3. Wait until the web resource reads healthy.
4. Create and deploy the worker resource, with the same values and
   `WORKER_PACKAGES=ffmpeg`.
5. Make the first admin, as described next.
6. Save the Gemini and ElevenLabs keys in Settings → AI.
7. Walk through the live site with the checks below.

## Making the first admin

Every new account is a member (`src/lib/api/auth/auth.ts:361`), and nothing in
the app turns the first account into an admin. The deploy-app skill's
`create-admin.mjs` does it now, with the details from the private keys file.
By hand, it is:

1. Tyler registers on the live site as typham2@gmail.com and clicks the link
   in the verification email.
2. One database update makes that account an admin:

   ```sql
   update users set role = 'admin' where email = 'typham2@gmail.com';
   ```

3. Tyler signs out and in again, and the account menu shows Admin.

Never run `scripts/setup-database.mjs` against the live database. It seeds a
development admin with a known password and creates a workspace.

Pomodoro is one site for everybody (`workspaces.whoMayHave` is unset, which
means `"off"`). The first person to sign in creates that one site, and
everybody after them is put in it. This is normal app behaviour, not a seed.

## The live walk-through

Run in a real browser, on the live domain:

- `https://<the domain>/api/health` answers 200, and the worker resource reads
  healthy in Coolify.
- A new account signs up, gets the email, and every link in it starts with
  `https://<the domain>`, never `localhost`.
- After verifying, it finishes a focus session, and the session appears in
  History.
- Two browsers in one room show the same countdown and see each other's chat.
  This also proves the room's live updates
  (`src/routes/api/pomodoro/rooms.$slug.events.ts`) get through Cloudflare. The
  stream sends `Cache-Control: no-cache, no-transform`,
  `X-Accel-Buffering: no` and a heartbeat, which is what Cloudflare needs. It
  is only proven once it is really there.
- An uploaded clip comes back as 720p with no sound.

## The laptop dry run, 8 Oct 2026

Commit `d2d5de0df`, both images built from the root `Dockerfile` with the
arguments above, against an empty Postgres 18 database, in the release order.

- **Database:** 0 tables before. The website applied all 125 database changes,
  `0000_custom_shell_baseline.sql` through `0122_pomodoro_personal_rooms.sql`,
  in 6 seconds, then served.
- **Health:** `/api/health` answered `{"status":"ok"}`, and the worker,
  started second, read healthy and logged no errors.
- **A focus session:** with a 1-minute focus, the front page counted down from
  1:00, moved to a short break, and History showed 1 session and 1 minute. The
  database had the session as completed.
- **A room:** one account hosted a room and a second joined it. Both browsers
  showed the same countdown (24:58, and later 22:38), each saw the other's
  chat message, and both were listed with the host marked.
- **Browser console:** no errors and no failed requests on either account.

What the laptop could not prove:

- **Sign-up and email.** There were no email keys, so the test accounts were
  put straight into the database as verified.
- **Uploads.** There was no R2 bucket. The FFmpeg conversion itself was proven
  inside the worker image in the FFmpeg task.
- **Cloudflare.** The room's live updates through Cloudflare, and HTTPS.

## The move to flowfly.app, 29 Oct 2026

pomoder.com stays registered and stays in Cloudflare for good. Two things on
it can never move:

- **`media.pomoder.com`** serves every uploaded file, and the database saves
  full addresses (profile photos, the logo and favicons in the settings row,
  181 catalogue files). Moving it would break them all.
- **`simulated.pomoder.com`** is the made-up members' email domain, saved on
  130 accounts.

What the move needs, and where each part stands:

- **Cloudflare zone:** flowfly.app was added on 29 Oct 2026, zone
  `7af3fe509eacf46dadbabe8ad6f34db7`, SSL "full" like pomoder.com. A
  `flowfly.app` → 5.78.189.158 and CNAME `www` → `flowfly.app`, both proxied.
  Cloudflare gave this zone `hera.ns.cloudflare.com` and
  `marty.ns.cloudflare.com`, not pomoder.com's pair, so Namecheap must list
  those two before the domain answers.
- **Turnstile:** the widget, now named "Flowfly", lists `flowfly.app`,
  `pomoder.com` and `pomodoro.barelycompany.com`. The keys did not change.
- **Coolify:** Pomoder Web answers on `flowfly.app`, `www.flowfly.app`,
  `pomoder.com`, `www.pomoder.com` and `pomodoro.barelycompany.com`.
  `CUSTOM_SHELL_APP_ORIGINS` lists all five. `CUSTOM_SHELL_EMAIL_FROM` is
  `Flowfly <hello@pomoder.com>` on both resources.
- **`CUSTOM_SHELL_APP_URL`** becomes `https://flowfly.app` on both resources
  only once flowfly.app answers, because every email link is built from it.
- **Resend:** refused flowfly.app with "You have reached the domain limit of
  your plan". The account holds three sending domains (barelycompany.com,
  pomoder.com, systemeverything.com). Until Tyler upgrades or frees one,
  emails go out from hello@pomoder.com.
- **The redirect:** pomoder.com and www.pomoder.com send every page to the
  same path on flowfly.app, except `/api/webhooks/*`. Stripe treats a
  redirect as a failed delivery, so its webhook keeps working on pomoder.com
  until Tyler points it at `https://flowfly.app/api/webhooks/stripe` and
  pastes the new signing secret in Settings → Payments.
- **Members are signed out once.** A sign-in belongs to the domain it was
  made on, so everybody signs in again on flowfly.app.

## Release record

### The watch page fix, 11 Oct 2026 (later)

- **Commit:** `fb493c6cd`, 3 commits after `b8968f834`: the watch page's React
  error 418 fix and the once-per-hour schedule (`4fa1974e7`), and a Project
  polish commit with its merge, which Pomoder's build does not install. No
  migrations, so the website and worker built together.
- **Deployments:** web `p2goog3pxmbjgvyx3p8y9v5c` (718s), worker
  `c12xvvp20wfte7eut2fteayg` (641s), both healthy. Health 200. Both menus and
  the four AI keys were already the same.
- **Browser check:** signed in as Tyler, the watch page's Today, All and
  Paused tabs open with no page error in a Toronto browser and a Tokyo one,
  the schedule in each browser's own time, and nobody listed twice in an
  hour.

### Made-up members touching real ones, Tyler's controls, 11 Oct 2026

- **Commit:** `b8968f834`, 20 commits after `a9ae0ea53`, six of them
  Pomodoro's: live activity tasks 04 and 05 with the visit delay setting, join
  and leave notices, whole-card joins and the switch-room question
  (`5ba9667d6`), Polish 3 (`adfcb2f65`, `0a52a665d`), the phone background band
  and red bell count (`56fbabbe3`), the Veo fixes (`46fadc5e5`) and the last
  release record (`9b6919cc8`). The rest were Promo and Project commits merged
  from `develop`, which Pomoder's build does not install.
- **Migration:** 0154 (`pomodoro_simulated_reach`), applied by the website on
  its way in, so the website went first.
- **Website:** deployment `jt5scbhjt2yxh9o7l5qj0xp0`, 550 seconds, healthy.
- **Worker:** deployment `b10vhm7v9njtyfzuql3h0x5l`, 488 seconds, healthy. It
  now runs `pomodoro-simulated-social`.
- **Health:** `https://pomoder.com/api/health` answered `{"status":"ok"}`.
- **Left menu:** the admin menu differed (Themes had become Backgrounds, and
  Made-up members is new under Profiles) and was copied; the members' menu was
  already the same.
- **AI keys:** all four already there.
- **Browser check, signed in as Tyler, nothing pressed that changes data:** the
  watch page drew its three tables (130 made-up members, 86 focused today, 23
  made-up rooms open), Made-up members is in the menu, the card reads 10 to 60
  seconds, 8 hours, 100 hours and 50 cents, the Focus page's totals line and
  Real members only show, `/plans` reads Free, Pro yearly, Pro monthly, the
  room cards press as a whole with a black Join pill, and a made-up profile
  carries `noindex` and is not in `/sitemap.xml`.
- **Found:** the watch page threw React error 418, because its times were
  drawn on the server in the server's time zone. Fixed after this release by
  drawing them only in the browser, proved locally in a Tokyo browser, and
  deployed in the next release.
- **Still owed:** a walk-through as a real member (a follow arriving, a
  visitor in a hosted room, a report in a room), and the room name as a chip
  in the tray, which waits on Tyler's call. The 418 fix went live in the next
  release.

### Uploads, sharing, rooms and the shell merge, 10 Oct 2026 (evening)

- **What shipped:** 22 commits, from a5dff7b88 up to a9ae0ea53: the upload
  window, My uploads, sharing, rooms, safety, AI, paying and playback
  (uploads-and-sharing tasks 01 to 08), the room card's settings cog with a
  host's people limit, the Custom Shell merge (d5885cec8), and the guest room
  list's entry in the open endpoints. The push also carried another session's
  Project app commits (99e28a440); Project was not redeployed.
- **Migrations:** 15 applied by the website on its way in, 0133 to 0138 and
  0145 to 0153.
- **First push refused:** `develop` held the Project app's two commits, so
  `develop` was merged into this branch (a9ae0ea53, no overlapping files) and
  the deploy run again.
- **Website:** deployment `yc64x6tmxs679cta0p9tm4at`, 550 seconds, healthy.
  Website first because migrations shipped.
- **Worker:** deployment `b8ika5ydmbt2z52s1c85c9rc`, 487 seconds, healthy.
- **Health:** `https://pomoder.com/api/health` answered `{"status":"ok"}`.
- **Left menu:** the admin menu differed and was copied; the members' menu was
  already the same.
- **AI keys:** all four already there on live (Anthropic, OpenAI, Gemini,
  ElevenLabs), the same last four characters as the local ones.
- **Browser check:** as a visitor, `/rooms` lists Starting soon and Open to
  join, and `/copyright` shows its form. Signed in as Tyler, the timer,
  Sounds with its Catalogue, Shared by members and Saved tabs, Member uploads
  and Settings → AI (four keys set) all opened, with no page errors and no
  failed requests.
- **Still owed:** a hosted room on live to see the cog and people limit
  (not opened, because a live room is visible to members), a real purchase
  and refund of a pack, and the shell's `public-branding.test.ts`, which
  expects the public header without the merged "menu font size" setting.

### YouTube clips and the worker fix, 10 Oct 2026

- **Commit:** `a5dff7b88`, 4 commits after `b157fdafa`: the worker crash fix
  (`6fb938086`), the YouTube clip themes (`de59d983c`), and a merge of
  `develop` carrying the new `apps/project` app, which Pomoder's build does not
  install. No migrations, so the website and worker built together.
- **Deployments:** web `heutibv6as1tum35g9b8uv7g` (725s), worker
  `jzfpr49za0ux0d4tgeix1qfy` (649s). Health 200. The admin left menu was copied
  to live; the AI keys were already there.
- **Worker packages:** `WORKER_PACKAGES` on Pomoder Worker became
  `ffmpeg yt-dlp`, in the production and preview copies. It must stay
  "literal", so Coolify quotes it: an update through the API turned that off,
  and an unquoted value with a space could split in the build command.
- **Right after the deploy, every page's JavaScript answered 404 for a few
  minutes**, the old and new website containers overlapping. Sign-in did
  nothing. Ten minutes later three fresh visits all worked. A 404 under
  `/assets/` carries `max-age=14400` from Cloudflare, so a browser that
  visited in those minutes can keep the dead page for up to 4 hours; a hard
  refresh clears it.
- **YouTube refuses the live server.** A clip of Big Buck Bunny from 1:35,
  made as Tyler on pomoder.com, failed in about 20 seconds with "YouTube
  refused the server", YouTube's bot check. The same clip works from Tyler's
  Mac and from the worker's image on the Mac, so it is the server's address,
  not the code. The failed Draft "YouTube clip"
  (`a96122bf-73bd-4f60-b810-e9cf97f97bd9`) is still in the live Themes list.
- **Owed:** Tyler's choice of a way round YouTube's bot check.
- **Content copied from the Mac the same day.** Tyler saw live as "still the
  old version": the code was new, but themes, sounds and rooms are data, and
  a deploy never copies data. On his word ("2"):
  - **Catalogue:** 167 files (682 MB) copied from the development bucket into
    the `pomoder` bucket under the same paths, then 151 rows inserted and
    "Lofi girl" updated in one transaction. Live now has 17 Live themes and 35
    Live sounds (plus 100 Draft sounds), as on the Mac. The 15 built-in items
    deleted on the Mac were set to Draft on live, not deleted.
  - **Made-up members:** `simulated.accounts` (130, 3 hours) and
    `simulated.voice` copied from the Mac, then Make them now pressed as Tyler
    on Settings → Made-up members. 130 made in about 3½ minutes; Starting soon
    and /users filled.
  - Both were one-off scripts run from this Mac, not part of the deploy. A
    later catalogue change on the Mac needs the same copy again.

### Payments on, 9 Oct 2026

- **Commit:** `fecc266a0`, 18 commits since the first deploy, five migrations
  (0123 to 0127), so the website went first and the worker followed.
- **Deployments:** web `j2wnpbhv9f8smdv7wkb92tas` (web: finished after 540s), worker `dmqa9zjmed2csgq2unq5k1ps` (476s). Health 200.
- **New on the server:** `CUSTOM_SHELL_BILLING_ENABLED=true` on both
  resources, runtime only. The Stripe keys live in Settings → Payments, not in
  the environment.
- **What it switched on:** Pro at $9 a month and $78 a year through the
  "Pomoder" Stripe account. The live plans page reads "Get Pro". See
  [Switching payments on](switching-payments-on.md).
- **Also carried:** the admin tasks 02 to 07 and the personal room from
  earlier in the week, and the left menu now shows Profiles and Themes.
- **Owed:** Tyler's real purchase and refund, the last step of the payments
  task.

### First deploy, 8 Oct 2026

- **Commit:** `ff4e8e09d`, pushed to `develop`, which is the branch both
  resources build from through Coolify's "Public GitHub" source. Auto-deploy is
  off, so a push deploys nothing until someone presses Deploy.
- **Coolify (US, project Pomoder):**
  - Pomoder Web `w21w5iit9f1kgxxak2et2hmg`: `https://pomoder.com` and
    `https://www.pomoder.com`, with www redirecting to the bare domain.
  - Pomoder Worker `cxjb1e2704wr4ewqztrdnsm7`: no web address.
  - Pomoder DB `lemznkk0o4h0wqcq295kozv7`.
- **Build stage:** Coolify's API cannot set "Docker Build Stage Target", so
  Tyler sets it by hand, `web` on Pomoder Web and `worker` on Pomoder Worker.
  Without it Docker builds the last stage in the file, which is the worker.
- **DNS:** pomoder.com A `5.78.189.158` and www CNAME `pomoder.com`, both
  proxied through Cloudflare. They replaced Namecheap's parking records.
- **Website:** deployment `vy0ue0fsh1fvss5togheekiy` built in about 9
  minutes, and Coolify's health check passed. From outside, through
  Cloudflare, `https://pomoder.com/api/health` answered `{"status":"ok"}`, the
  front page loaded, and `www` and plain `http` both redirected to
  `https://pomoder.com/`.
- **Worker:** deployment `b138cxtth4mef1dkjx9j8i74`, started after the website
  was healthy, reads "running:healthy" ("Worker healthy"). Its build log shows
  FFmpeg 8.1.2 being installed. The website's build log does not, as intended.
- **Browser check as a visitor:** the page is a secure context, the guest
  timer starts and keeps counting across Rooms, Plans, Leaderboard and Sounds,
  and the sign-up page shows Cloudflare's "Verify you are human" box. The
  only errors logged came from Turnstile's own challenge scripts, which
  probe automated browsers.
- **Admin:** on 8 Oct 2026 `create-admin.mjs` made typham2@gmail.com a
  verified admin. Tyler had already registered, so it promoted that account.
  The port it opened was confirmed closed afterwards. Signing in on the live
  site landed on `/admin/dashboard`, and `/admin/users` opened.
- **Storage key:** replaced the same day with one limited to the `pomoder`
  bucket. Both resources restarted onto it and read healthy.
- **Still owed:**
  - The signed-in walk-through: email links, a focus in History, two browsers
    in a room, and an uploaded clip.
  - The Gemini and ElevenLabs keys in Settings → AI.
