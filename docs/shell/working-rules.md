# Working rules

How to make a change here and how to prove it works.

## Scope of a change

- Keep changes small and direct.
- Fix only the behaviour that was asked for.
- Do not refactor next-door code unless the change needs it.
- Prefer deleting code to adding code.
- Only fix build, lint or type errors your own change caused.
- Never hide a failed operation. Say what failed.
- When you summarise finished work, leave full file paths out of the summary.

## Verifying locally

- `npm run test` runs the whole suite. Run the files your change touches first,
  and the whole suite only when the change is wide.
- When the app has an `npm run test:app` script, that is the suite for audits
  and pre-commit checks. It skips the shell's own test files and starts each
  test's database from a saved copy, so it is several times faster and deletes
  nothing. Run the full `npm run test` only after a shell merge or when the
  change touches a shell file on purpose. The app documents the details in its
  own `workspace/docs/`.
- `npx tsc --noEmit -p tsconfig.app.json` is the real type check. The plain
  `typecheck` script checks nothing, because the root tsconfig is `"files": []`.
  There are errors that were already there, so compare the list of files against
  the list before your change instead of expecting silence.
- If `npx tsc` reports errors in files nobody touched, run
  `./node_modules/.bin/tsc` instead. `npx` can pick up a different copy of
  TypeScript and invent errors that are not there.
- `npx eslint <files>` works. `npm run format` is broken and always has been.
- Never start a dev server. Use the one already running on this app's port from
  `local-apps.json`. `docs/local-enviroment.md` explains why a running port
  belongs to whichever worktree got it first.

## Proving a screen works

Run the `validate-app` skill after any change a browser can see. A green build,
a clean type check and a `curl` returning 200 say nothing about whether the page
crashes once its JavaScript runs. Measure anything about size or position with
`getBoundingClientRect()` and print the number. A screenshot that looks about
right has been wrong more often than it has been right.
