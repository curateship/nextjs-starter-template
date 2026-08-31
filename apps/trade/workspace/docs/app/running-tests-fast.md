# Running tests fast

Both test commands start each test's database from a saved copy instead of
replaying every migration. `npm run test:app` skips shell-owned test files, and
`npm run test` includes the complete Trade and shell suite. Neither command is
an everyday check. Run the smallest focused test files for the change unless
Tyler explicitly asks for a full suite in the current request.

## What it skips and why that is safe

- Any test file whose path also exists in `apps/custom-shell` is the shell's
  test, not this app's. Those files only change during a shell merge, so a
  normal trade change cannot break them. The skip list is computed on every
  run by comparing paths against `../custom-shell`, so a file the trade app
  later takes over is picked up again automatically.
- No test is deleted and no assertion is weakened. Every skipped file still
  runs under plain `npm run test` with the same saved database setup.

## The database snapshot

Almost every server test builds a fresh in-memory database by replaying all of
`drizzle/` before every single test. Measured on 25 Aug 2026, one replay takes
just over a second alone and several seconds when files run in parallel, and
that setup was most of the suite's running time.

- `src/server/test-support.fast.ts` does the replay once, saves the finished
  database as one file under `node_modules/.cache/test-db/`, and starts every
  later test from that file in about 150ms.
- The saved file's name includes a fingerprint of the migration scripts. Add
  or edit a migration and the next run builds a fresh copy; the old one is
  ignored.
- `vitest.app.config.ts` and `vitest.full.config.ts` point imports of
  `@/server/test-support` at the fast file. The full config inherits the
  shell's settings without excluding its tests. The shell's `test-support.ts`
  and `vitest.config.ts` stay untouched, so the shell merge stays clean.

## Who decides when to run a full suite

Only Tyler chooses when to run `npm run test:app` or the full `npm run test`.
An audit, pre-commit check, shell merge or earlier request does not grant
permission. Use focused test files unless Tyler asks for one of those suites in
the current request.

## Measured on 28 August 2026

The unchanged full suite ran 301 files and 3,527 tests in 611.44 seconds. The
same 301 files and 3,527 tests passed with the saved database in 211.47 seconds.
The change removed 399.97 seconds from the complete run on this machine without
skipping a file or an assertion.
