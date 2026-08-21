# CLAUDE.md — Custom Shell

Custom Shell is the template every other app is built from. See `AGENTS.md` for
where the docs and tasks live; this file is only about the one thing that makes
this app different from the others.

## How apps are made, and why it constrains you

A new app is a **copy of this whole folder**. Improvements made here reach those
apps later by merging this app into them — one way, shell → app, forever.

A merge only has something to argue about when **both sides edited the same
file**. So the rule that keeps every app able to take shell updates is:

> **An app never edits a shell-origin file. Not even one line.**

An edited shell file is a fork. It does not conflict once — it conflicts on
every future merge, forever, and it always will. That is how `apps/trading`
ended up unable to take shell updates at all: its `schema.ts` drifted about two
thousand lines from this one.

## What an app may edit

Three things, and nothing else:

- **`src/app/**`** — the app's own answers. This is how an app changes shell
  behaviour. The shell creates these files once and never touches them again.
- **Files the app itself created** — new routes, components, tables, workers,
  and new endpoints under `src/lib/api/`. A new file has no shell version, so it
  can never conflict.
- **`drizzle/` migrations it added**, and its own `.env`.

Everything else in the repo belongs to the shell.

## App options

One file holds an app's answers:

| App writes here | Shell reads it in |
| --- | --- |
| `src/app/options.ts` | `src/lib/app-options.ts` |
| `src/app/server-options.ts` | `src/server/app-options.ts` |

Two pairs because of one line: `options.ts` can be seen by the browser and
`server-options.ts` never is, since only `src/lib/api/*`, `src/routes/api/**`
and `src/server/*` may import `@/server/*`. Drawing and wording go in the first;
anything that reaches the database or calls something outside goes in the
second.

The shell file in each pair is the catalogue: it defines what can be changed and
what each option means. Anything not offered there is a compile error, on
purpose — the shell always knows every way an app can deviate from it.

**In Custom Shell itself both app files stay empty forever.** The moment the
shell puts a value in one, every app copied from it conflicts on that file on
every merge.

What is on offer today. An option is added when a real app needs it, never on
the guess that one might:

- `landing.page` — replace `/` outright: loader, `<head>` and component together
- `automations.nodes` — extra steps in the automation palette, each carrying its
  own icon and a pointer to its settings panel, paired with
- `automations.executors` (server) — what those steps do when a flow reaches
  them, keyed by the same `kind`
- `sitemap.extraEntries` (server) — public addresses from the app's own tables,
  read for the site whose domain is being answered
- `sitemap.chunkFiles` (server) — the numbered sitemap files an app serves when
  it has more addresses than one file can hold, which turns `/sitemap.xml` into
  an index of them and moves the site's pages to `/sitemap.xml?part=pages`
- `automations.canvasHeaderStatus` — a piece of the app's own in the canvas
  header, for what the flow IS right now rather than what a run produced
- `automations.runControl` — the app's own control in place of Run
- `automations.pauseControl` — the app's own control in place of Pause all

An app adds a step; it never replaces one of the shell's. A `kind` or a palette
key the shell already uses is refused out loud.

### The canvas header: shell buttons, and the app's chip

One rule, and it settles every argument this header has had:

> **An app's actions live in the app's chip. All of them.** The shell's own
> buttons stay the shell's, and an app switches off the ones that do not apply
> to it. There is no third place.

**Looking the same is not a reason to be the same button.** A control is shared
only when it *does* the same thing everywhere. Two apps that would write a
different sentence on the same button do not have the same button.

Run was where this first showed. In the shell it starts a flow; in Trade it is a
backtest, or switching real money on, or nothing at all because the flow is
already trading. No wording fixes that — the word itself has to change with what
the flow is, and the shell cannot know which of the three it is looking at.

Pause was the second, and it hid better because it looked identical. The shell's
Pause stops **every** automation in the workspace, which is right when
automations are emails and reminders. In Trade one flow holds a wallet with
money in the market: pausing everything is far too big a hammer, and pausing
just this one means something the shell has no word for — stop looking for new
coins, leave what is already placed exactly where it is. Same icon, same place,
different act.

The answer is not a slot per button. That way the header ends up half shell and
half app, with two places to look for an action and no line between them — the
crossover problem, moved rather than solved. So:

- **`automations.canvasHeaderStatus` is the app's one home in the header.** The
  chip says what the flow is, and carries every action that belongs to the app.
  It draws itself completely; the shell gives it a place to stand and nothing
  else.
- **Shell buttons an app does not want are switched off**, with a plain option —
  not replaced in place. Off is the app's decision; what the button does when it
  is on stays the shell's.
- **Every option defaults to today's behaviour**, so an app that says nothing is
  unchanged.

The test before adding anything to this header: *is this the shell acting, or
the app acting?* The shell's goes in the header as a shell button. The app's
goes in the chip. Nothing goes in both.

**The shell's own nodes are written exactly the same way**, so there is one way
to add a node rather than two. A node is:

- `src/lib/automations/nodes/<kind>.ts` — what it is: its palette card, its
  icon, its settings rules, and a pointer to its panel.
- `src/components/automations/nodes/<kind>-panel.tsx` — its settings panel.
- an executor — what it does when a flow reaches it.

The panel is a separate file and the descriptor points at it with
`fields: () => import("@/components/automations/nodes/<kind>-panel")`, never the
component itself. The engine reads descriptors, so anything a descriptor's
module imports is loaded on the server too — and a panel with a dropdown in it
imports `@/lib/api/*`, which builds a server function as it loads and throws
outside a request, at boot. The pointer is never followed until a browser draws
the panel. There is nothing to remember: the type accepts nothing else.

### Where a setting belongs

Three homes, and the test is simple: **if you can picture a Settings screen for
it, it is not an app option.**

- **`ShellConfig` (database)** — an admin changes it while the app runs, and two
  installs of the same app can differ. App name, sidebar, styling, maintenance,
  home routes.
- **An environment variable** — a secret, or something that differs between
  staging and production of the *same* app. Stripe keys, `..._BILLING_ENABLED`.
- **An app option** — decided once by whoever builds the app, the same on every
  install, and changing it means a code change and a deploy.

### When an app needs an option that does not exist

Steps 1 and 2 settle most of these without touching the shell at all.

1. **Stop. Do not edit the shell file in the app.**
2. **Can it be done without an option?** A new file in the app, an existing
   Settings value, or an env var. Prefer these, in that order. Note that
   `memberHomeRoute` and `adminRoute` already point anywhere, and every sidebar
   item already has `visible` and `roles` — a surprising amount is already
   possible without code.
3. **Otherwise the change is made here, in custom-shell.** Add the option to the
   type with a doc comment, add its reader with **the default equal to today's
   behaviour**, and change the shell's call site to read through the reader.
4. **Prove the shell did not change.** With the option unset: `npm run test`,
   then open the app in a real browser. It must behave exactly as before.
5. **Merge shell → app** using the checklist in the monorepo's root `CLAUDE.md`.
6. **Set the option** in the app's `src/app/options.ts`, or
   `src/app/server-options.ts` if it runs on the server.

The shell is opinionated at the core and open at the edges. Auth, sessions,
security and the guard rules are the core: an app that wants those to work
differently should say so out loud rather than switch it off quietly.

### Rules for writing option code

- **Every reader is a `function`, never a `const`.** An app's options file
  imports an app component, which imports shell components, which can import the
  options module — a real circle. Function declarations are hoisted and survive
  it; a const read during boot throws.
- **Call readers inside a component or a loader, never at the top level of a
  module.** Route files are the one exception: nothing imports them back, so the
  circle cannot reach them. This is why the node registry works its list out on
  first use instead of at import — a module-level list would be built while the
  app's own nodes are still loading.
- **A default is written once, in the reader.** `ShellConfig` already gets
  defaulted in three separate places; app options must not become a fourth.
- **`src/app/**` never declares a `createServerFn`.** The guard test only walks
  `src/lib/api`, so an endpoint declared in `src/app` would be an unguarded door
  nobody is told about. New endpoints go in `src/lib/api/`, which never
  conflicts anyway. This matters most in `server-options.ts`, which is allowed
  to reach the database.
- **`src/app/options.ts` never imports `src/app/server-options.ts`.** That is
  the back door that would drag the database into the browser bundle.

`src/lib/app-options.test.ts` and `src/server/app-options.test.ts` cover the
defaults and the last two rules. The first three are conventions no test can
see, so they are on whoever writes the code. Defaults are checked by passing an
empty object rather than by reading this app's own answers, so the check keeps
working inside an app that has set an option.

## Verifying locally

- `npm run test` — the whole suite.
- `npx tsc --noEmit -p tsconfig.app.json` — the plain `typecheck` script checks
  nothing (the root tsconfig is `"files": []`). There are pre-existing errors, so
  compare the list of files rather than expecting silence.
- `npx eslint <files>` works. `npm run format` is broken and always has been.
- Never start a dev server; use the one already running on this app's port from
  `local-apps.json`.
