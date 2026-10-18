# Going live

Personal's live address is `https://personal.barelycompany.com`. Tyler chose
it on 18 Oct 2026, so the apps on `barelycompany.com` count as the same site
as Personal. That is what lets an app's sign-in reach Personal's panel.

## Where it runs

- **Server:** the German Hetzner box, 46.224.177.156, next to Trade. Tyler's
  pick, 18 Oct 2026.
- **Coolify:** project "Personal" (`ehm9qp1t83xvxpdjqgwx1gun`), application
  "Personal Web" (`q5zidodlzqnja0etohqln7la`). It builds `develop` from the
  public GitHub repo with `apps/personal/Dockerfile`, base `/`, port 3000.
  Auto-deploy is off.
- **DNS:** `A personal.barelycompany.com` → 46.224.177.156, proxied by
  Cloudflare, the same as `trade.barelycompany.com`. The zone's https mode is
  Full.
- **The menu** is `/data/menu.json` on the Coolify volume
  `q5zidodlzqnja0etohqln7la-personal-menu`, mounted at `/data`. A redeploy
  keeps it.
- **No database, email, storage, Turnstile or worker.**

## Its settings

All three are run-time settings in Coolify, never build-time, so none ends
up in the image.

| Setting | Value |
| --- | --- |
| `PERSONAL_PASSWORD` | The same password as `apps/personal/.env.local`. Copied by a script that never prints it. |
| `PERSONAL_ORIGIN` | `https://personal.barelycompany.com`. Sign-in, sign-out and menu saves only come from here. |
| `PERSONAL_MENU_FILE` | `/data/menu.json`, on the volume. |

The server refuses to start without any of them and names the missing one
in the log, so a deploy with a missing setting fails its health check
instead of going live half-working.

## How it is built

- **`apps/personal/Dockerfile`**, built from the repo root. The root
  `Dockerfile` is for shell apps (Nitro, migrations, a worker) and doesn't
  fit.
- **`npm run build`** makes the page in `dist/`, then the live server in
  `dist-server/main.js` with Vite's server build. The server carries its
  packages inside it, so the image has no `node_modules`.
- **The image** holds only `dist/` and `dist-server/main.js`. It runs as
  the `node` user, and checks itself on `/health`.
- **The live server** (`server/live.ts`, started by `server/main.ts`):
  `/health` answers `ok` with no sign-in. Then the sign-in and `/api/menu`
  run, the same as on the dev server. Then the built files: hashed files
  under `/assets/` are cached for a year, and everything else is never
  cached. Any other address gets the page, so
  `/trade.barelycompany.com/admin/...` reloads onto that screen. Nothing may
  frame Personal: `X-Frame-Options: DENY`.
- **Wrong passwords** are counted per visitor, named by Cloudflare's
  `CF-Connecting-IP` header. `sign-in.md` has the details.

## Deploying

In `apps/personal`, type `npm run deploy`. That runs the `deploy-app`
skill's script: it pushes the branch to `develop`, builds on Coolify, and
checks `https://personal.barelycompany.com/health`. Add `-- --dry-run` to see
the plan without deploying. A deploy ships the whole branch.

## Changing the password

- **On live:** change `PERSONAL_PASSWORD` in Coolify, then redeploy or
  restart Personal Web. Every browser is signed out.
- **On this Mac:** change the line in `apps/personal/.env.local`. Vite
  restarts itself. The two are separate after the first copy.

## The live menu

The first deploy starts with no menu file, so live shows the starting menu.
Straight after it, a one-off script signs in and sends this Mac's
`data/menu.json` to live. After that the two menus are separate, as Tyler
chose on 18 Oct 2026. The local `http://localhost` links show an empty panel
on live, because an https page can't frame an http one. Change them to the
apps' real addresses in live's Edit the menu.

## Checked before the first deploy

- The image was built and run on Tyler's Mac on 18 Oct 2026, with a
  throwaway password and a scratch volume. It refused to start with no
  settings. `/health` answered `ok`, and a deep address got the page.
  `/api/menu` answered 401 when signed out. The sign-in cookie was Secure
  behind https. A saved menu survived a restart, and Docker marked it
  healthy. A browser signed in and reloaded on it with no console errors.

## Release record

| Date | Commit | Deployment | Notes |
| --- | --- | --- | --- |
| Not deployed yet | | | Waits for Tyler to say "deploy". |
