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
- **Never open with an acknowledgement.** "Fair", "Fair enough", "You're
  right", "Good catch", "Good point", "Understood", "Noted", "Got it" are all
  banned as opening words. They agree without saying anything, so the first
  line is wasted — and after a mistake they read as smoothing it over instead
  of fixing it. Open with the answer, the fix, or what changed.
- **Every sentence has to stand on its own.** Name what it is about and say
  what happened to it. Never lean on the sentence before it with "this",
  "that" or "it" — say the word again, however repetitive it feels. A sentence
  that only makes sense beside the one before it is half a sentence, and Tyler
  then has to ask what was meant.
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

## The Code Is Never The Argument

Code is not right or wrong. It is what happens, not what should happen. Whether
it is right is a question about what the app is FOR, and that lives with Tyler,
not in the file.

So **never answer "why is it doing that" by quoting the code**. You may well
have written the line yourself last week and have no memory of it; a line you
wrote proves only that you wrote it.

- **When Tyler says it is wrong, he is handing you the intent.** That outranks
  anything in the repo. The job from that moment is to find why the code does
  not match what he just told you — not to defend the code, and not to explain
  it back to him.
- **Never repeat a claim with more confidence.** He should not have to produce a
  screenshot to be believed. If you disagree, go and test it; if you cannot
  test it, say so.
- **Say when you cannot see the history.** A long conversation gets summarised
  and the earlier turns are genuinely gone. "I no longer have that part of the
  conversation" is an answer. Asserting through the gap is not.

**The case this comes from.** On 18 Aug 2026 he said a liquidation had never
ended a DCA ladder. It was insisted twice that the rule was old, on the evidence
of a line dated 7 Aug. The line WAS old — and it had never once ended a ladder,
because it only ran at the end of a candle, by which time a deeper rung had
bought and the position was alive again. A change made that same day ran it
every minute instead. The code was quoted correctly and the answer was still
wrong, because the code was never the question.

- **Never state a measurement as a settled fact.** Say what was measured and
  what it does not cover. In one afternoon "the money ran out", "only one coin
  lost depth" and "a stop fired" were all said flatly and all three were wrong.
- **A broken measurement is worse than none.** One of those came from a script
  keyed on a field that did not exist, which silently collapsed 156 coins into
  one row. Before believing a number, check it can tell the two answers apart.
- **Fix it, do not apologise for it.** One sentence on what was wrong and what
  changed. No repeated apologies, no reciting your past mistakes back at him.

## Copying a Pattern Means Copying Every Layer of It

When Tyler says "copy the pattern from X", he means the whole thing, not the
part you happen to be looking at. Read every layer before writing a line:

- **What it looks like** — the screen, the panels, the labels, the arrows.
- **What it does** — the rules, the maths, the edge cases.
- **How it runs** — where the code lives, what starts it, how often, whether
  it is a page, a background job or a program of its own.
- **What holds it up** — its database tables, its locks, its heartbeat, its
  restart behaviour, its deploy.

**A layer you did not open is a layer you got wrong.** This is not
hypothetical. The Trade app's screens were copied from `apps/trading` while its
plumbing was not, so live ladders ended up driven by the browser: close the tab
and no rung bought and no stop fired, with real money in the trade. The answer
was sitting in `apps/trading/worker/` the whole time — a separate program, a
database lock so only one copy trades, a heartbeat, and an open socket to the
exchange so it is *told* each price instead of asking every few seconds.

- **Say what is different before reusing anything.** "Practice trading, nobody
  watching" and "real money, nobody watching" are not the same problem. One
  sentence out loud catches this.
- **Name the layers you read, in the reply.** If you only read one, say so
  rather than implying the port is complete.
- **The old app is the specification.** `apps/trading`, `apps/directory` and
  the rest are reference-only, but reference means read them, and read all of
  them, not the file that matches the ticket title.

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

- **Each agent may have only one shell session open at a time. Finish or close it before opening another.**
- **Never start a dev server (foreground or background). Always use the server already running on the app's configured port.**
- Every new app must receive one unused port under its app key in `local-apps.json` when the app is created.
- **`local-apps.json` is the only place where an app port may be assigned. Never duplicate or hardcode the port in app code, scripts, tests, environment defaults, Dockerfiles, or documentation; those consumers must read it from `local-apps.json`.**
- Never use another port or change an existing assignment unless the user explicitly requests that exact reassignment.
- **Never start a new dev server if one is already running.** If an app's configured port is taken, that running server IS the one to use — do not spawn another on a fallback port. Running duplicate servers on scattered ports mucks everything up and confuses which URL is real.
- Before running `pnpm run dev`, check whether the port is already listening: `lsof -iTCP -sTCP:LISTEN -nP | grep :<port>`. If it is, reuse that instance.
- All Vite apps set `strictPort: true`, so `pnpm run dev` errors out instead of silently hopping to the next port. Keep it that way.

### A port belongs to whichever worktree got it first

There is one port per app but **many worktrees**, each holding a full copy of
every app. So the port says which app it is, and **the running process says which
worktree you are actually looking at**. Those are two different questions and
only the first is written down anywhere.

- **Always ask who owns the port before you touch it**, and print the answer:

  ```sh
  P=$(lsof -tiTCP:<port> -sTCP:LISTEN); lsof -a -p $P -d cwd -Fn | grep '^n'
  ```

- **If it is serving another worktree, it is not yours. Never kill it, and never
  start a second one.** Killing it takes the app away from whoever is using it,
  and their uncommitted work is still the only copy of what they are testing.
- **Say so and stop.** Tell the user which worktree holds the port and what you
  need, and let them decide. Restarting the app somewhere else is their call, not
  a step you take on the way to something else.
- **A merged commit is not a running app.** Merging to `develop` changes nothing
  on screen until the worktree serving the port pulls it. When a fix "isn't
  working", check the owner of the port before you re-read the code — that is
  the more common answer.
- The same holds for the database behind it: `.env` and `.env.local` are
  gitignored and per-worktree, so `npm run db:setup` from a worktree that lacks
  them recreates the container on the wrong port and takes the database away from
  the server that was using it.

## Validating Changes

- **After any browser-facing change, run `.agents/skills/validate-app` before calling the work done.** Open the page in a real browser and read the console.
- **Use Playwright. Not the Chrome extension.** The extension times out and leaves you guessing, and guessing at a layout wastes a whole conversation. Playwright always answers, and it answers with numbers.
- The "never start a server" rule above does **not** rule this out. Point Playwright at the server already running on the app's port, or at the deployed URL. Neither needs a new process.
- A green build, a clean type check and a `curl` returning 200 are not evidence the page works. Server-rendered HTML returns 200 while the client JavaScript crashes on hydration; only a browser sees that.
- **A screenshot alone is not evidence either. Measure the thing being asked about**, and print the number: `getBoundingClientRect()` for anything about width, position or overlap. "It looks fine" has been wrong more often than it has been right.
- Signing in: go to `/login` (not `/sign-in`, which 404s), fill `input[type="email"]` and `input[type="password"]`, and click `button[type="submit"]`.
- Do not wait for `networkidle` on a page that polls — it never fires. Use `domcontentloaded`, then `waitForSelector` on something the page draws.
- `playwright` is installed at the repo root, but only under `node_modules/.pnpm/`, so a bare `import "playwright"` fails even from the root. Import it by path: `node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs`.
- Anything that changes bundling or code splitting (chunking config, `dynamic()`/`lazy` imports, moving code across a `"use client"` boundary) can only be proven in a production build, since dev does not chunk. Do not treat chunk counts or file sizes as verification. Ask before running a production build locally, and check the deployed URL's console straight after the deploy.
