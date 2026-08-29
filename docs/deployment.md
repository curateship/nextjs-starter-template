# Deploying an app

Every app built on Custom Shell deploys the same way: **two Coolify resources
for one app**, built from the same commit.

- **The web resource** — the site people visit. It brings the database up to
  date on the way in, then serves pages.
- **The worker resource** — the background program. Automations, scheduled
  newsletters, and any jobs the app registered itself.

Both are built from the root `Dockerfile`, which takes the app's folder name as
its one argument.

## Apps never share anything

This is the rule the rest of the page is arranged around, and it is not a
preference:

**Two apps never share a database, and never share settings.** Not the
database, not the storage bucket, not the email account, not the AI keys, not
the Stripe keys, not the session secret. An app's web container and its worker
container share those with each other and with nothing else.

The code enforces the important half. Outside development, an app with no
`CUSTOM_SHELL_DATABASE_URL` refuses to start rather than reaching for a local
database — because on a host running several of these, "a local database" could
easily be another app's.

## Building the two images

From the repository root, not the app folder — this is a pnpm workspace and the
lockfile lives at the top.

```sh
docker build --target web    --build-arg APP=custom-shell -t custom-shell-web .
docker build --target worker --build-arg APP=custom-shell -t custom-shell-worker .
```

`APP` is the app's folder under `apps/`, which is also its name in
`package.json`. For a new app copied from Custom Shell, that one word is the
only thing that changes.

**No secret is ever a build argument.** Build arguments are recorded in the
image's history and can be read by anyone who can pull the image. Everything an
app needs is supplied at run time.

## Setting up the two resources in Coolify

Make two resources pointing at the same repository and the same commit.

| | Web | Worker |
| --- | --- | --- |
| Dockerfile | root `Dockerfile` | root `Dockerfile` |
| Build target | `web` | `worker` |
| Build argument | `APP=<app folder>` | `APP=<app folder>` |
| Port | 3000 | none — it serves nothing |
| Health check | built into the image | built into the image |

Give both resources the same runtime values. The worker needs them too: a
newsletter step in an automation sends real email from the worker, so the
worker needs the email settings just as much as the website does. A worker
missing a key fails the job rather than the container, which is a quiet way to
lose work.

### The values

Only one of these actually stops the app. The other two fail quietly, which is
worse, so what goes wrong is written next to each.

- `CUSTOM_SHELL_DATABASE_URL` — this app's own database. **Nothing starts
  without it**, on purpose. **The URL carries
  `?uselibpqcompat=true&sslmode=require`** so every connection is encrypted.
  Without the suffix, node-postgres sends everything — the password, session
  tokens, stored keys — across the wire readable. A bare `sslmode=require` is
  not the same thing: node-postgres treats it as full certificate
  verification and refuses a self-signed server certificate, where the
  `uselibpqcompat` form encrypts without verifying, which is what these
  self-signed database servers need. The database server itself must have
  `ssl = on` first; Trade's went on 29 Aug 2026
  (`apps/trade/workspace/docs/app/database-link-encryption.md` records how).
- `CUSTOM_SHELL_APP_URL` — the public address. Set it. Without it the app falls
  back to its local development address and starts perfectly happily, and then
  every link it emails — verify your email, reset your password, return from
  checkout — points at `localhost` on the recipient's own machine.
- `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` — encrypts the keys held in the
  database. Without it they are not encrypted. Changing it later makes every
  stored key unreadable, and the recovery is pasting each one in again — there
  is no decrypting them.

As the app uses them:

- `CUSTOM_SHELL_RESEND_API_KEY`, `CUSTOM_SHELL_EMAIL_FROM` — sending email.
- `CUSTOM_SHELL_GOOGLE_CLIENT_ID`, `CUSTOM_SHELL_GOOGLE_CLIENT_SECRET` — signing
  in with Google.
- `CUSTOM_SHELL_TURNSTILE_SITE_KEY`, `CUSTOM_SHELL_TURNSTILE_SECRET_KEY` — the
  "are you a human" check.
- `CUSTOM_SHELL_R2_PUBLIC_URL` — where uploaded media is read from.
- `CUSTOM_SHELL_BILLING_ENABLED` — whether payment screens appear.
- `CUSTOM_SHELL_APP_ORIGINS`, `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` — extra
  addresses this app answers on, for apps serving more than one site.

## Releasing, in order

1. **Back up the database first.** A migration is applied once and recorded;
   there is no undo built into it. This is the only rollback there is.
2. **Deploy the web resource.** It runs the database update, then starts. If
   the update fails, the server never starts, the health check never passes,
   and the container already serving keeps serving. A broken release does not
   take the site down.
3. **Wait for the web resource to be healthy.**
4. **Deploy the worker resource.** It never changes database structure, so it
   is deployed second, against a database the web resource has already brought
   up to date.

### Why that order matters

Coolify can keep the old web container alive while the replacement starts, so
for a minute or two the old code and the new database exist together. **A
migration must not break the release before it.** Add columns and tables; do
not rename or drop something the previous release still reads. If a column has
to go, that is two releases: stop using it, then remove it.

## Health checks

Both images carry their own, so Coolify needs no configuring.

- **Web** — `GET /api/health`. It answers `200` only when the server is up
  *and* its database answers a query. A server whose database is unreachable
  serves a confident home page and then fails on every screen that loads
  anything, which is exactly what this catches.
- **Worker** — `node worker/dist/health.mjs`. It answers well only when the
  loop is still going round *and* its database answers. The worker writes a
  heartbeat after every pass; a missing or old one means the loop has stopped
  even though the process is still technically alive.

Neither prints the database address, the connection string, or the underlying
error. Container health output is widely readable. The real error goes to the
container's own log.

The worker build writes external JavaScript source maps for local debugging.
Those maps contain file names and line mappings, but not `sourcesContent`, so
they never contain a readable copy of the server source. Each app's Dockerfile
decides whether the map itself belongs in its running image. Trade copies only
the three `.mjs` programs and leaves every map in the build stage.

## Rolling back

1. Redeploy the previous commit's web resource.
2. Then the previous commit's worker resource.
3. **The database does not roll back with them.** That is why migrations only
   add. If a release has to be undone and its migration genuinely cannot be
   left in place, restore the backup from step 1 of the release.

## Restarting and overlapping

Both background jobs claim their work in the database before doing it, so an
old worker and its replacement running together during a deploy cannot both
process the same automation run or the same newsletter batch. Stopping a worker
lets the pass in flight finish first.

Anything claimed but not finished when a container is killed outright is picked
up again by the existing stale-claim rules.

**This is not a substitute for a job that genuinely must be single.** Trade's
trading engine takes an exclusive database lock because two copies would mean
twice the position, and it stays its own program with its own deployment.

## What runs where

- **In development**, one process does everything. The dev server ticks its own
  background loop, started by the first request. Nothing changes: `pnpm dev`
  is still all you need.
- **In production**, the web container serves requests and nothing else, and
  the worker does every background pass. That is deliberate — otherwise "is
  background work running" would depend on how many web containers happen to
  be up.

## Checking it before you trust it

The whole path can be run on a laptop against a throwaway database:

```sh
docker network create shell-check
docker run -d --name check-db --network shell-check \
  -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=shellcheck postgres:18

docker build --target web    --build-arg APP=custom-shell -t custom-shell-web .
docker build --target worker --build-arg APP=custom-shell -t custom-shell-worker .

URL=postgresql://postgres:localdev@check-db:5432/shellcheck
docker run -d --name check-web --network shell-check -p 3999:3000 \
  -e CUSTOM_SHELL_DATABASE_URL=$URL custom-shell-web
docker run -d --name check-worker --network shell-check \
  -e CUSTOM_SHELL_DATABASE_URL=$URL custom-shell-worker

curl http://127.0.0.1:3999/api/health
docker inspect --format '{{.State.Health.Status}}' check-web check-worker
```

Tear it down with `docker rm -f check-web check-worker check-db` and
`docker network rm shell-check`.

## Checks before a release

`.github/workflows/custom-shell-ci.yml` runs on every pull request touching the
app: lint, typecheck, tests, the web build, the worker build, and then both
Docker images. The images are built and thrown away — nothing there pushes,
tags, or deploys.
