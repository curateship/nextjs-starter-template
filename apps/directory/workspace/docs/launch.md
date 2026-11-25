# Going live

Directory runs on server1.barelycompany.com (185.55.243.241) with every other
app. It serves one site, Eat Drink Toronto, on `https://eatdrinktoronto.com`.
The admin's own address is `https://directory.barelycompany.com`. Tyler asked
for it on 23 Nov 2026 ("deploy eatdrinktoronto.com").

## Why this was a first launch

- **eatdrinktoronto.com had been down since 1 Nov 2026.** It used to be served
  by the old Directory app, "System Everything App", on the US server. Course
  took systemeverything.com from that app on 31 Oct 2026 and the old app was
  stopped. The domain's A record still pointed at the US server, so Cloudflare
  answered 522.
- **This app had never been deployed.** The old go-live task
  (`workspace/tasks/deploy/01-eatdrinktoronto-goes-live.md`) planned a move onto
  the US server alongside System Everything. System Everything went to Course
  instead, so only Toronto came here.

## Decided

- **Payments off, Google sign-in off.** Tyler, 23 Nov 2026.
  `CUSTOM_SHELL_BILLING_ENABLED` is `false`, and no Google values are set.
- **Live started from the laptop's data.** The local `cms` database was dumped
  and restored as it was. That gave live 3,333 listings, 930 of them
  published, and 3,334 media rows.
- **Only Tyler's account came across.** The restore was followed by deleting
  every session and the 28 test accounts. All 3,334 media rows belong to
  `typham2@gmail.com`, so no photo went with them.
- **Multisite is on.** `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` is
  `sites.barelycompany.com`. Setting it is what makes eatdrinktoronto.com find
  the Toronto workspace by its saved custom domain. Without it every host is
  the deployment itself, and `/` on the deployment's own host forwards to sign
  in (`the-root-address.md`). Nothing answers on `*.sites.barelycompany.com`,
  and nothing needs to.

## Where it runs

- **Coolify:** project "Directory" (`uhuwkm18zrfbuxq3k73a3ntt`).
- **Directory Web** (`3sga9hloro15ilekduk8mkly`) answers on
  `directory.barelycompany.com`, `eatdrinktoronto.com` and
  `www.eatdrinktoronto.com`. Build stage `web`.
- **Directory Worker** (`6ony9pvux2xl02le5efldaas`) has no address. Build stage
  `worker`.
- **Directory DB** (`jgruodqfc51a2xcgnbhpf49s`), Postgres 18, no public port,
  user and database both `directory`. Its address has no `sslmode` suffix,
  because the link never leaves the server.
- **Both resources** build `develop` from the public GitHub repo with the root
  `Dockerfile`, base `/`, port 3000. Auto-deploy is off. Git commit is `HEAD`.
- **DNS:** `A eatdrinktoronto.com` and `A directory.barelycompany.com` point
  at 185.55.243.241, proxied. `www.eatdrinktoronto.com` is a CNAME to the bare
  name. Both zones' https mode is Full.

## Email, storage and the human check

- **Email goes out from `Eat Drink Toronto <hello@barelycompany.com>`.**
  Resend refused to add eatdrinktoronto.com because the plan's three domains
  are used (flowfly.app, barelycompany.com, systemeverything.com). Sending from
  the site's own domain needs a bigger Resend plan or one of those three
  removed. Directory has its own key, "Directory (barelycompany.com send
  only)", which can only send, and only from that domain.
- **New uploads go to the R2 bucket `directory`**, in Western Europe, served
  from `https://media.eatdrinktoronto.com`. Its key is "Directory storage
  (directory bucket only)". On 23 Nov 2026 the key wrote, read and deleted a
  file there, and the `custom-shell` bucket refused it.
- **Every photo live uses is in the `directory` bucket.** The laptop keeps
  its photos in the `custom-shell` bucket, and the restore brought their
  `https://pub-2d0e69feb8744cffb581864bc2994dc5.r2.dev/...` addresses along.
  The website's image resizer answers 400 for any picture outside the app's
  own bucket, so most photos on the first deploy did not show.
- **The fix, 24 Nov 2026.** The 3,353 files those addresses named (131.6 MB)
  were copied into `directory` under the same paths. Then the 3,336 saved
  addresses on live were changed to `https://media.eatdrinktoronto.com/...`.
  They sat in eleven columns, 3,325 of them in `directory_listings.featured_image`.
  The laptop's data still names `custom-shell`, so a future restore from the
  laptop needs the same change.
- **The bucket's CORS rule** lets the browser `PUT`, `GET` and `HEAD` from
  eatdrinktoronto.com, www.eatdrinktoronto.com and directory.barelycompany.com.
- **Turnstile:** the widget "Directory (eatdrinktoronto.com)", managed mode,
  for eatdrinktoronto.com and directory.barelycompany.com.

## Every value

All of these are run-time values on both resources, except `APP`. The live
copies are in `apps/directory/.env.live`, which git ignores and which exists
only in workspace-16. The old US server's Coolify login moved to
`apps/directory/.env.live.old-us`.

| Value | Live setting |
| --- | --- |
| `CUSTOM_SHELL_DATABASE_URL` | Directory DB's internal address |
| `CUSTOM_SHELL_APP_URL` | `https://directory.barelycompany.com` |
| `CUSTOM_SHELL_APP_ORIGINS` | `https://directory.barelycompany.com`. A site's own custom domain is trusted without being listed. |
| `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` | `sites.barelycompany.com` |
| `CUSTOM_SHELL_API_ENV` | `production` |
| `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` | Made once on 23 Nov 2026. Never change it: every saved key becomes unreadable. |
| `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` | The send-only key above, `Eat Drink Toronto <hello@barelycompany.com>` |
| `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` | The "Directory (eatdrinktoronto.com)" widget |
| `CUSTOM_SHELL_R2_ACCOUNT_ID`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_BUCKET_NAME`, `_PUBLIC_URL` | The `directory` bucket and its own key |
| `CUSTOM_SHELL_BILLING_ENABLED` | `false` |
| `APP` | `directory`, build time, both |

## Saved keys that did not survive the move

The laptop's encryption key is not live's, so anything the laptop saved
encrypted cannot be read on live. That covers the email settings key and any
Stripe keys typed into local Settings. The AI keys were written fresh by
`copy-ai-keys.mjs` at launch.

## Deploying

In `apps/directory`, type `npm run deploy`. It pushes the branch to
`develop`, builds the website and then the worker, checks
`https://directory.barelycompany.com/api/health`, and copies the live left
menu down to this Mac. The deploy-app skill has the rest.

## Owed on the live site

- **Junk emails:** run `npm run drop:junk-emails` against the live database,
  then again with `--write` (`junk-emails.md`).

## Checked before the first deploy

On 23 Nov 2026 both images were built on this Mac from the root `Dockerfile`
with `APP=directory`. The website image was run against a copy of the restored
data. It applied 0160 and 0161, answered `{"status":"ok"}`, and drew the
Toronto home page, `/directory` and `/sitemap.xml` for the host
eatdrinktoronto.com.

## Release record

| Date | Commit | Deployments | Notes |
| --- | --- | --- | --- |
| 24 Nov 2026 | `590bff661` | web `tajdpvgqxck1sldly2nghdgo` (27 min), worker `yfrp6s5a2pjuju2yflzkjalc` (35 min), web restart `2spvupmfsqhgfzcm6z7hhdx7` | First launch. Health `{"status":"ok"}` on both addresses. 0160 and 0161 applied on the website's first boot. Admin password set by `create-admin.mjs`, four AI keys copied, left menu already the same. Photos moved to the `directory` bucket and the web restarted. Playwright drew the Toronto home page, `/directory` and `/directory/12-tables` with every picture loaded and no console errors, then signed in on directory.barelycompany.com and opened the dashboard and Settings with no console errors. Owed: sending from eatdrinktoronto.com (Resend plan), and pasting the email settings key again in live Settings if one was saved on the laptop. |
