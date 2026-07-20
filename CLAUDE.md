# CLAUDE.md

Monorepo-wide guidance for agents. App-specific rules live in each app's own `apps/<name>/CLAUDE.md`.

## Dev Servers

- **Never start a dev server (foreground or background). Always use the server already running on the app's configured port.**
- Every new app must receive one unused port under its app key in `local-apps.json` when the app is created.
- **`local-apps.json` is the only place where an app port may be assigned. Never duplicate or hardcode the port in app code, scripts, tests, environment defaults, Dockerfiles, or documentation; those consumers must read it from `local-apps.json`.**
- Never use another port or change an existing assignment unless the user explicitly requests that exact reassignment.
- **Never start a new dev server if one is already running.** If an app's configured port is taken, that running server IS the one to use — do not spawn another on a fallback port. Running duplicate servers on scattered ports mucks everything up and confuses which URL is real.
- Before running `pnpm run dev`, check whether the port is already listening: `lsof -iTCP -sTCP:LISTEN -nP | grep :<port>`. If it is, reuse that instance.
- All Vite apps set `strictPort: true`, so `pnpm run dev` errors out instead of silently hopping to the next port. Keep it that way.

## Validating Changes

- **After any browser-facing change, run `.agents/skills/validate-app` before calling the work done.** Open the page in a real browser and read the console.
- The "never start a server" rule above does **not** rule this out. Point the browser at the server already running on the app's port, or at the deployed URL. Neither needs a new process.
- A green build, a clean type check and a `curl` returning 200 are not evidence the page works. Server-rendered HTML returns 200 while the client JavaScript crashes on hydration; only a browser sees that.
- `playwright` is installed at the repo root. Scripts using it must be run from the repo root so the import resolves.
- Anything that changes bundling or code splitting (chunking config, `dynamic()`/`lazy` imports, moving code across a `"use client"` boundary) can only be proven in a production build, since dev does not chunk. Do not treat chunk counts or file sizes as verification. Ask before running a production build locally, and check the deployed URL's console straight after the deploy.
