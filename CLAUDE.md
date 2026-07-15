# CLAUDE.md

Monorepo-wide guidance for agents. App-specific rules live in each app's own `apps/<name>/CLAUDE.md`.

## Dev Servers

- Every new app must receive one unused port under its app key in `local-apps.json` when the app is created.
- **`local-apps.json` is the only place where an app port may be assigned. Never duplicate or hardcode the port in app code, scripts, tests, environment defaults, Dockerfiles, or documentation; those consumers must read it from `local-apps.json`.**
- Never use another port or change an existing assignment unless the user explicitly requests that exact reassignment.
- **Never start a new dev server if one is already running.** If an app's configured port is taken, that running server IS the one to use — do not spawn another on a fallback port. Running duplicate servers on scattered ports mucks everything up and confuses which URL is real.
- Before running `npm run dev`, check whether the port is already listening: `lsof -iTCP -sTCP:LISTEN -nP | grep :<port>`. If it is, reuse that instance.
- All Vite apps set `strictPort: true`, so `npm run dev` errors out instead of silently hopping to the next port. Keep it that way.
