---
name: deploy-app
description: Deploy an app in this monorepo to Coolify. A repeat deploy is one script, and the first launch of a new app follows the checklist here (its own Coolify project, database, DNS, email, storage, Turnstile, first admin). Use when Tyler asks, in his current message, to deploy, ship, launch or put an app live. Repo-specific; ship-release is the generic version.
---

# Deploy App

A repeat deploy takes about 20 minutes, most of it Coolify building. A first
launch takes an afternoon the first time and should take an hour with this
checklist. Pomodoro's launch on 8 Oct 2026 is the worked example, recorded in
`apps/pomodoro/workspace/docs/launch.md`.

## Before anything

- **Tyler asked for a deploy in his current message.** An earlier "deploy" does
  not carry forward. A deploy ships the whole branch, never one commit picked
  out of it.
- **Never print a secret.** When reading `secrets.env`, `.env.live`,
  `~/.claude.json` or `~/.codex/config.toml`, hide every line, not only
  `NAME=value` ones. The comment lines in Trade's `.env.live` hold plain-text
  passwords.
- **Read the app's `workspace/docs/launch.md`** when it has one. It lists every
  value the app needs and what breaks without it.

## Keys and servers

Every key lives in one private file on this Mac:
`~/.config/deploy-app/secrets.env` (folder `700`, file `600`). Nothing else
holds them for this skill, and they never go into the repo, a chat or a log.
The deploy script reads the Coolify keys from it. Load the others the same
way inside a script, never by printing the file.

| Name in the file | What it is |
| --- | --- |
| `COOLIFY_US_URL`, `COOLIFY_US_TOKEN` | US Hetzner, 5.78.189.158. Runs Pomoder (project "Pomoder"), System Everything and Core. |
| `COOLIFY_DE_URL`, `COOLIFY_DE_TOKEN` | German Hetzner, 46.224.177.156. Runs Trade. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | The Cloudflare account (typham2@gmail.com) and its one token for setting things up. |
| `RESEND_API_KEY` | Resend (typham2@gmail.com), full access, so it can add sending domains. |
| `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_NAME`, `FIRST_ADMIN_PASSWORD` | Tyler's admin account, created on every app by `create-admin.mjs`. Tyler, 8 Oct 2026. |

- **A new Coolify server** gets its own pair, `COOLIFY_<NAME>_URL` and
  `COOLIFY_<NAME>_TOKEN`, a line in the table above, and its short name as
  `server` in `apps.json`.
- **Both Coolifys build `develop`** from GitHub through the "Public GitHub"
  source. Auto-deploy is off everywhere, so pushing `develop` deploys nothing
  until a deploy button is pressed.
- **Each app's own live values** (its database address, encryption key,
  storage key, Turnstile keys) are in `apps/<app>/.env.live`, which is
  gitignored.
- **One Coolify project per app.** Tyler, 8 Oct 2026: the old "System
  Everything" project is out of date. Never add a resource to it.
- **The `coolify-us` and `coolify-de` MCPs** in Claude Code use the same two
  tokens. Codex has its own German entry in `~/.codex/config.toml`.

## One-time setup (Tyler, once ever)

Only redo a line when a key is lost or a server is added.

1. **One Cloudflare setup token, named "claude".** It is the token already
   in the file, a **user** token under Cloudflare → My Profile → API Tokens.
   To change what it can do, Edit it there rather than making another. The
   token's text stays the same, so the file does not change. It needs:
   - Account → **Workers R2 Storage → Edit** (buckets and their addresses)
   - Account → **Turnstile → Edit**
   - Account → **Account API Tokens → Edit** (so I can make each app's own
     storage key, limited to its bucket)
   - Account → **Account Settings → Read**
   - Zone → **Zone → Edit** (to add a new domain)
   - Zone → **DNS → Edit**
   - Zone → **Zone Settings → Edit** (HTTPS mode)
   - Zone Resources: **All zones**, not one domain. No expiry.

   This is a different thing from the keys on the R2 page (R2 → Account
   Details → API Tokens, and the Account API Tokens list). Those are storage
   keys a live server uses to read and write files, one per app. Widening one
   of those does nothing for setup, and it hands the live server more power.
   The setup token is a **personal** token under My Profile.
2. **A Coolify token per server.** Coolify → Keys & Tokens → API tokens, with
   read, write and deploy permissions. The US and German ones are already in
   the file.
3. **Resend** is already in the file. A replacement must be a **Full access**
   key, because sending-only keys cannot add domains.

The whole-account token can do almost anything to every site in the account,
so it stays on this Mac. Each app gets its own small keys for the server: a
storage key for its one bucket, its own Turnstile widget, and its own database
user.

## A repeat deploy

### Tyler's command

The same as Trade's. In the app's own folder (`apps/pomodoro`), type:

```sh
npm run deploy
```

Add `-- --dry-run` to see the plan without deploying:
`npm run deploy -- --dry-run`.

It works because the app's `package.json` has
`"deploy": "node ../../.agents/skills/deploy-app/scripts/deploy.mjs --push"`.
npm passes the app's name in, so that line is the same in every app. It lives
in custom-shell's `package.json` (added 8 Oct 2026), so every app gets it on
its next shell merge. Trade keeps its own `deploy` line, and a shell merge into
Trade must keep Trade's and drop the shell's. From the worktree's top folder,
the long form is
`node .agents/skills/deploy-app/scripts/deploy.mjs pomodoro --push`.

It does the whole deploy in one go:

1. Pushes the branch to `develop`, fast-forward only. If `develop` has
   commits the branch lacks, it stops before deploying anything.
2. Says what is live now and how many commits ship.
3. Builds the website and the worker **at the same time** when no new
   database migration ships, which takes about 10 minutes instead of 18.
   When a migration ships, the website goes first, because it applies the
   migration on its way in, and the worker follows once it is healthy. The
   plan line says which, and why.
4. Checks the live health address and prints the answer.

Useful extras, each after `npm run deploy --`: `--dry-run` shows the plan and
deploys nothing, `--only worker` deploys one resource, `--in-order` never builds both at once, and `--force`
rebuilds without Docker's cache. Uncommitted changes never ship, and the
script says so when there are some.

### When I deploy

1. **Tyler asked in his current message.** A deploy ships the whole branch.
2. **Look at what ships.** Run `--dry-run` first. Say in the report if the
   push carries another app's files. That app is not redeployed now, but its
   next deploy takes them.
3. **Commit only if Tyler asked.** Uncommitted files never ship.
4. **Run Tyler's command.** Never force a push. If the push is refused, stop
   and ask.
5. **Check it in a real browser** with the `validate-app` skill, on the live
   domain.
6. **Record it** in the app's `launch.md` → Release record: the commit, the
   date, the deployment ids, and anything owed.

Trade has its own script: `cd apps/trade && npm run deploy` (engine, then
worker, then web). Pomodoro's first builds took about 9 minutes for the
website and 8 for the worker, including the image's 300-second health-check
start period.

## The first launch of a new app

Send Tyler his list in one message at the start, then work through my steps.
He does one short sitting before the deploy and signs in after it.

### Tyler's list, in one go

Ask for the answers up front:

- **The domain**, already bought at any registrar.
- **The server:** US unless he says otherwise.
- **The first admin's email:** typham2@gmail.com unless he says otherwise.
- **Anything off at launch:** payments and Google sign-in were off for
  Pomoder.

**Sitting 1, when I say the resources are ready** (about 5 minutes):

1. At the registrar, change the domain's nameservers to the two Cloudflare
   ones I give him.
2. In Coolify → project `<App>` → `<App> Web` → Configuration → Build, set
   **Docker Build Stage Target** to `web` and press Save.
3. Same on `<App> Worker`, with `worker`.

**After it is live** (2 minutes): sign in with the admin account I made, and
add the AI provider keys in Settings → AI if the app uses them.

### My steps

1. **Laptop dry run.** Follow `docs/deployment.md` "Checking it before you
   trust it" with `APP=<app>` against an empty Postgres. Browse it as
   `http://localhost:3999` with `CUSTOM_SHELL_APP_ORIGINS=http://localhost:3999`
   and a public-looking `CUSTOM_SHELL_APP_URL` (see the traps). Write the
   app's `workspace/docs/launch.md` from Pomodoro's.
2. **Add the domain to Cloudflare.** `POST /zones` with
   `{name, account: {id}, type: "full"}`. Note the two `name_servers` for
   Tyler's sitting 1. A pending zone already takes DNS records.
3. **Email.** `POST https://api.resend.com/domains` with
   `{name, region: "us-east-1"}`. Add the four records it returns to the zone,
   all **DNS only** (`proxied: false`). The sender is `<App> <hello@<domain>>`.
4. **Turnstile.** `POST /accounts/{account}/challenges/widgets` with
   `{name, domains: [<domain>], mode: "managed"}`. Both keys go into
   `.env.live`.
5. **Storage.**
   - **The bucket:** `POST /accounts/{account}/r2/buckets` with `{name,
     locationHint}`. Use `wnam` for the US server.
   - **Its own key:** `POST /accounts/{account}/tokens` with the permission
     group "Workers R2 Storage Bucket Item Write" on the resource
     `com.cloudflare.edge.r2.bucket.<account>_default_<bucket>`. The Access
     Key ID is the token's `id`, and the Secret Access Key is the SHA-256 of
     its `value`. Worked on 8 Oct 2026 for Pomoder, with the permission
     group's id read from `GET /accounts/{account}/tokens/permission_groups`.
     Name it `<App> storage (<bucket> bucket only)`.
   - **Test the key:** write, read and delete a file with
     `@aws-sdk/client-s3`, then check that another bucket is refused.
6. **Encryption key.** Generate it once with `secrets.token_urlsafe(32)` into
   `.env.live`. Never change it, and put the same value on the website and the
   worker.
7. **Coolify project.** `POST /api/v1/projects` with `name` and
   `description`. The description allows only letters, numbers, spaces and
   `- _ . , ! ? ( ) ' " + = * / @ &`, so no colons.
8. **Database.** `POST /api/v1/databases/postgresql` in the project's
   `production` environment, with `image: postgres:18-alpine`,
   `is_public: false`, its own `postgres_user` and `postgres_db`, and a random
   40-character password. Read `internal_db_url` from `GET /databases/{uuid}`
   straight into `.env.live`. Because it is internal only, the address needs
   no `sslmode` suffix. Never use "System Everything DB": its SSL is off, and
   turning it on restarts the live System Everything site.
9. **The two resources.**
   - **Create:** `POST /api/v1/applications/public` with `git_repository`
     `https://github.com/curateship/nextjs-starter-template`, `git_branch`
     `develop`, `build_pack` `dockerfile`, `dockerfile_location`
     `/Dockerfile`, `base_directory` `/` and `ports_exposes` `3000`. Set
     `is_auto_deploy_enabled`, `health_check_enabled` and `instant_deploy`
     all false. The image's own health check is used.
   - **The website** also gets `domains` `https://<d>,https://www.<d>`,
     `redirect` `non-www` and `is_force_https_enabled` true.
   - **The worker** gets no domains. Coolify gives it an `sslip.io` address
     anyway, so `PATCH` its `domains` to `""`.
   - **The build stage:** the API refuses `dockerfile_target_build` and
     `inject_build_args_to_dockerfile`, which is why it is in Tyler's sitting
     1. Without it, Docker builds the last stage in the file, the worker.
10. **Variables.** `POST /applications/{uuid}/envs`, one per value, with
    `is_preview: false` and `is_literal: true`.
    - **Build-time** (`is_buildtime: true`): only `APP`, plus `WORKER_PACKAGES`
      on a worker that needs one.
    - **Everything else** (`is_buildtime: false`, `is_runtime: true`): a
      build-time value is recorded in the image's history.
    - **The list:** Pomodoro's `launch.md` table has every value. Two are easy
      to miss: `CUSTOM_SHELL_APP_ORIGINS` and `CUSTOM_SHELL_API_ENV=production`.
      `CUSTOM_SHELL_R2_PUBLIC_URL` is `https://media.<domain>`, set before the
      address exists.
11. **Send Tyler sitting 1.** Wait for him.
12. **Once the zone is active:**
    - **Storage address:** connect `media.<domain>` to the bucket with
      `POST .../r2/buckets/{bucket}/domains/custom` (`domain`, `zoneId`,
      `enabled: true`, `minTLS: "1.2"`). Do this before anything is uploaded,
      because the shell saves full file addresses such as profile photos.
    - **Email:** `POST /domains/{id}/verify` on Resend.
    - **The site's address:** in the zone, set `A @` to the server's IP and
      `CNAME www` to the bare domain, both proxied. Replace any registrar
      parking records.
13. **Deploy.** Add the app to `apps.json`, check its `package.json` has the
    `"deploy"` line (it comes from the shell), then run `npm run deploy` in
    its folder. A first deploy always goes website first, then
    worker, because nothing is live yet and every migration is new. It ends
    by checking `https://<domain>/api/health`.
14. **Make Tyler's admin account.** Every new app gets one, straight after
    its first deploy. Add the database's uuid to `apps.json`, then run
    `node .agents/skills/deploy-app/scripts/create-admin.mjs <app>`.
    - **What it uses:** the email, name and password are `FIRST_ADMIN_*` in
      `secrets.env`. They never go in this skill or anywhere in the repo,
      because the repo is public.
    - **What it does:** it opens a public port on the database for about a
      minute and closes it in a `finally`. It adds the account as admin and
      verified, with the password hashed exactly as the app does. If Tyler
      registered first, it promotes that account and sets this password.
    - **Prove it:** sign in on the live site with those details and open
      `/admin/users`.
    - **Never** run `scripts/setup-database.mjs` against a live database.
15. **Send Tyler the after-launch note:** sign in, and add the AI keys.
16. **Walk through and record.** Use `validate-app` on the live domain, then
    fill in the Release record in `launch.md`.

## Traps that cost time on 8 Oct 2026

- **"There is no Coolify MCP."** There was one, in Codex's config. Check
  `claude mcp list` and `~/.codex/config.toml` before saying an MCP is missing.
- **The timer needs a secure page.** On plain `http://` at any address but
  `localhost`, `crypto.randomUUID` does not exist and Start does nothing.
  Headless Chromium ignores `--unsafely-treat-insecure-origin-as-secure`.
- **Production refuses a `localhost` address in `CUSTOM_SHELL_APP_URL`**,
  because emailed links would point at the reader's own machine.
- **A missing `CUSTOM_SHELL_APP_ORIGINS` refuses every form** with "Invalid
  origin". People see "We could not complete that request."
- **Sign-up needs working email** in production, so test accounts on a laptop
  go straight into the database as verified.
- **Querying Cloudflare's nameservers directly from this laptop returned
  nothing** even while the records were live. Trust Resend's verify call or
  `1.1.1.1`.
- **Trade's variables are all build-time.** Do not copy that setup.
- **Cloudflare imports the registrar's parking and email-forwarding records.**
  Replace A and www at deploy time, and ask Tyler whether the forwarding still
  matters.

## The report

One sentence that says it is live (or what stopped it). Then bullets: the live
address, the commit, both deployment ids, the health answer, what the browser
check covered, and what is still owed. Name anything Tyler has to click or
delete, such as setup tokens, a key's scope or the build stage.
