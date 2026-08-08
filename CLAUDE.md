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

## Discuss Before Planning

When Tyler is thinking out loud, asking a question, pushing back, or debating an
approach, the deliverable is the answer — not a plan. Answer, then stop and let
him respond.

- **Never write or edit a plan file mid-discussion.** Not to "capture progress",
  not to "fold in" what he just said. It resets the conversation and he has to
  drag you back to the point.
- **Never ask for approval while he is still talking.** No ExitPlanMode, no
  multiple-choice popups. He will say when the discussion is done.
- **The go-ahead is explicit**: "write the plan", "let's do it", "go". Nothing
  else counts — not agreement on one point, not a long thread, not a question
  that sounds like a decision.
- **Never rename an idea and present it as a new answer.** If he rejects an
  approach, either defend it or change the substance. Moving the same mechanism
  into different files is not a new proposal, and he will notice.
- **Hold one position across the conversation.** If your earlier answer
  contradicts your current one, say so plainly and pick one.

## Custom Shell Is the Template — Apps Never Edit Shell Files

`apps/custom-shell` is the base every future app is copied from. Updates flow
one way: shell → app, via git merge. For any app built on top of the shell:

**Only three apps are built on: `apps/cms`, `apps/trade` and `apps/video`.**
Every other app in `apps/` is kept as **reference only** — read it to see how a
feature already works when porting one, but never work in it, never fix it, and
never merge the shell into it. Do not delete them either; they are the only
record of how several features behave.

A shell change therefore only has to merge cleanly into those three, and must
not be weighed against the rest. Those three are also the only ones still in
sync with the shell: nine of the others put their own tables inside the shell's
`src/server/schema.ts` and have drifted so far that they can no longer take a
shell update at all. That is what the rule below prevents, and it is not
hypothetical.

- **App code goes in the app's own files and folders.** Never edit a
  shell-origin file inside an app's copy — not even a one-line tweak. An edited
  shell file is a fork, and every future shell merge will conflict on it.
- **If the app genuinely needs the shell to behave differently, change
  `apps/custom-shell` itself** — as an option that is off by default — then
  merge the shell into the app and switch the option on. The shell gets better;
  the app stays clean.
- **Those options live in `src/app/`**, the one folder an app may edit besides
  files it created itself. The shell defines what is on offer in
  `src/lib/app-options.ts`; the app writes its answers in `src/app/options.ts`.
  Anything not on offer is a compile error, so the shell always knows every way
  an app can deviate. **`apps/custom-shell/CLAUDE.md` is the full rulebook — read
  it before building an app on the shell or adding an option to it.**
- **Pulling shell updates into an app is an AI job with a fixed checklist:**
  merge the latest shell, resolve conflicts, run the app's tests, then open the
  app in a real browser (`.agents/skills/validate-app`). A merge that compiles
  can still break a page — the browser check is not optional.

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
