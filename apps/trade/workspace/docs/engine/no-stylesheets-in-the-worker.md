# Stylesheets never reach the engine

The worker build turns every stylesheet import into an empty module. The engine
and the background worker then contain no `.css`, `.scss`, `.sass` or `.less`
import at all, and neither can be stopped from starting by one.

## Why a stylesheet stops the engine

The worker build bundles the app's own code and leaves every dependency as a
plain import for Node to load. That is deliberate and it is in
`scripts/build-worker.mjs`: `pg` and `argon2` carry native binaries and cannot
be bundled at all.

Node can load JavaScript and nothing else. An import of a package's stylesheet
left standing is not a slow start or a missing style, it is
`ERR_UNKNOWN_FILE_EXTENSION` on the first line, before any of the engine's own
code runs. The container exits, Coolify calls the new container unhealthy, and
the deploy rolls back.

## The day it happened

On 25 Sep 2026 the engine stopped at 11:26 PM Toronto time and did not come
back for over ten hours. Every deploy after that rolled back with:

```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".css"
for /app/node_modules/react-image-crop/dist/ReactCrop.css
```

The path from the engine to a stylesheet is long and every step of it is
ordinary:

```
worker/src/index.ts
  → src/server/trade/ladder-worker.ts
  → src/server/trade/flow-run.ts → … → src/server/guards.ts
  → src/server/ticker.ts → src/server/background-pass.ts
  → src/server/automations/engine.ts
  → src/lib/automations/node-registry.ts
  → src/lib/app-options.ts → src/app/options.ts
  → src/components/social/public-profile-setting.tsx
  → src/components/social/public-profile-dialog.tsx
  → src/components/shared/image-upload.tsx
  → src/components/media/media-picker.tsx
  → src/components/media/image-crop-step.tsx
```

The last file imports `react-image-crop/dist/ReactCrop.css`. It arrived with
public trader profiles on 24 Sep 2026, which put the profile setting into the
app's options list.

Nothing in that chain is a mistake. The automations palette is built from the
same components a person clicks, so server code reaching UI files is how the
palette knows what the app can do. Forbidding the reach would mean keeping the
options list apart from the screens it names.

## What the rule is instead

`scripts/worker-drop-css.mjs` is an esbuild plugin that answers every
stylesheet import with an empty module. The engine has no browser and no
screen, so a stylesheet it imported was already doing nothing. Turning it into
nothing at build time costs nothing and takes away the whole class of failure:
the next stylesheet that gets pulled in behind a UI import cannot kill the
container.

It applies to all three programs the build produces, because they are built in
one call: the engine (`trade.mjs`), the background worker (`worker.mjs`) and
the health check (`health.mjs`).

## Proving it before a deploy

Two checks, neither of which trades:

- `node --test scripts/worker-drop-css.test.mjs` — a stylesheet beside the
  code and a package's stylesheet both vanish, and the bundle runs.
- `npm run build:worker`, then
  `grep -n 'from "[^"]*\.css"\|import "[^"]*\.css"' worker/dist/*.mjs`, which
  should find nothing. A plain search for `.css` still finds a few comments.

To watch the engine start without letting it trade, point it at a database that
is not there:

```
NODE_ENV=production \
CUSTOM_SHELL_DATABASE_URL="postgresql://nobody:nobody@127.0.0.1:1/nowhere" \
node worker/dist/trade.mjs
```

It prints `trade worker: starting` and then fails on the database, which is the
proof: it got past loading its own modules. It cannot take the trading lock,
because the lock lives in the database it cannot reach. Never boot it against
the real address to test it. The local `CUSTOM_SHELL_DATABASE_URL` is the live
database, and a second engine would wait for the lock and then trade.
