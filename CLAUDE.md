# CLAUDE.md

Monorepo-wide guidance for agents. App-specific rules live in each app's own `apps/<name>/CLAUDE.md`.

## Talk Like a Normal Person

This applies to every reply and every summary of finished work, in every app,
with no exceptions. Tyler is smart but is not a programmer or a trader. Write
the way you would explain something to a friend over coffee.

**Never use these words. There is always a plain replacement:**

| Don't write | Write instead |
| --- | --- |
| no-op, inert, dead code | "it doesn't do anything" |
| monotonic | "every step is better than the last" |
| median | "typical" |
| gradient, delta | "the difference", "how much it changes" |
| naive / vanilla | "simple" |
| arm, gate, trigger (as nouns) | "switch on", "the rule that blocks it" |
| out-of-sample, walk-forward | "tested on months it had never seen" |
| drawdown | "how far down it went" |
| basket, universe | "the list of coins" |
| points (of a percentage) | just use dollars |
| green (meaning profitable) | "made money" |

**Rules that matter more than the word list:**

- **Use dollars, not percentages of percentages.** "A coin at $100 falls to $30"
  beats "a 70% drawdown". If a rule involves two percentages stacked on each
  other, you have to convert it to dollars or Tyler cannot check your work — and
  neither can you.
- **Lead with the answer.** Say what is true in the first sentence, then explain.
  Never build up to it.
- **Bullet points, not blocks of text.** After the opening line, put everything
  else in a short bullet list. A paragraph of four or more lines is a wall of
  text and is not allowed.
- **One idea per bullet, and keep it to one or two short sentences.** If a
  bullet needs a third sentence, it was two bullets.
- **Break long sentences up.** If a sentence has more than one comma, or you had
  to read it twice, split it into two sentences.
- **Never stack headings on tables on bullet lists.** Pick one shape and stay in
  it. At most one table per reply, and only when it genuinely beats bullets.
- **Say numbers out of 100, not as rates.** "45 out of 100 made money" beats
  "a 45% win rate".
- **Explain any unavoidable term the first time, in the same sentence**, in the
  everyday words a non-trader would use.

**The test before sending:** read it back and ask whether a smart friend with no
finance or coding background would follow it on the first pass. If any sentence
would make them stop and re-read, rewrite that sentence. Being accurate is not an
excuse for being dense — plain and honest at the same time is the requirement.

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
