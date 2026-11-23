# CLAUDE.md

Personal is a small app, not a copy of Custom Shell. It is one page: a left
menu, a top bar, and a frame in the middle that shows another app's real
screen. Tyler rebuilt it this way on 16 Oct 2026: "We dont want a 200k LOC for a
simple iframe app."

## How to reply

**Re-read `.agents/skills/unslop/SKILL.md` before every reply**, and check your
draft against it. Tyler is smart and is not a programmer, so the plainest true
sentence wins.

## Before you write code

- `workspace/docs/README.md` says what the app is for and lists its docs.
- `.agents/skills/Ui-standards/SKILL.md` is the UI standard. The files in
  `src/components/ui/`, `src/theme.css`, `src/border-first.css`,
  `src/styles.css`, `src/lib/utils.ts` and `src/lib/plural.ts` are copies of
  Custom Shell's. Change them in Custom Shell first and copy them over, so the
  frames keep matching the apps they show.
- The shell rules in the repo's `docs/shell/` do not apply here. There is no
  database, no sign-in, no worker and no `src/app/` options.

## After you write code

Write the doc in the same turn, in `workspace/docs/`, with a line in
`workspace/docs/README.md`.

## Verifying

- `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`, `npx eslint .`,
  `npx vitest run`.
- Never start a dev server. Use the one on port 3021 from `local-apps.json`,
  and run the `validate-app` skill for anything a browser shows.
