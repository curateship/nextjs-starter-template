# Local environment

How the apps run on this machine.

## Never start a dev server

A server is already running for every app. Use it.

- **Never start one, in the foreground or the background.** If an app's port is
  taken, that running server is the one to use. Do not spawn a second one on a
  fallback port. Duplicates on scattered ports make it impossible to tell which
  URL is real.
- Check first: `lsof -iTCP -sTCP:LISTEN -nP | grep :<port>`.
- Every app sets `strictPort: true`, so `pnpm run dev` fails instead of quietly
  hopping to the next port. Keep it that way.

## A port belongs to whichever worktree got it first

There is one port per app but many worktrees, each holding a full copy of every
app. The port says which app it is. The running process says which worktree you
are looking at. Those are two different questions and only the first is written
down anywhere.

- **Ask who owns the port before touching it**, and print the answer:

  ```sh
  P=$(lsof -tiTCP:<port> -sTCP:LISTEN); lsof -a -p $P -d cwd -Fn | grep '^n'
  ```

- **If it is serving another worktree, it is not yours.** Never kill it and
  never start a second one. Killing it takes the app away from whoever is using
  it, and their uncommitted work is the only copy of what they are testing.
- **Say so and stop.** Tell the user which worktree holds the port and what you
  need. Restarting the app somewhere else is their call.
- **A merged commit is not a running app.** Merging changes nothing on screen
  until the worktree serving the port pulls it. When a fix "isn't working",
  check who owns the port before re-reading the code. That is the more common
  answer.
- The database behind it works the same way. `.env` and `.env.local` are
  gitignored and per-worktree, so `npm run db:setup` from a worktree that lacks
  them recreates the container on the wrong port and takes the database away
  from the server that was using it.

## Ports

`local-apps.json` is the only place an app port is assigned.

- Every new app gets one unused port there when it is created.
- Nothing else keeps a copy of the number. App configs, runtime scripts, tests,
  environment defaults, Dockerfiles, health checks and documentation all read it
  from that file.
- Never use another port or change an assignment unless the user asks for that
  exact reassignment.
- Each live app's `vite.config.ts` reads its own entry and sets
  `strictPort: true`. The Personal IDE reads the same file for the server URL,
  and adds an entry when it creates an app.

## Local URLs

- `localapps` prints the running local app servers and their URLs. It is a
  user-local helper in `~/.local/bin`, not a repo script.
- When an app is not running, read `local-apps.json` for its address.
