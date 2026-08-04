# src/app — the app's answers

This folder belongs to the app, not the shell. It is the only place an app
changes how the shell behaves.

Apps are made by copying this whole repo, and shell improvements reach them
later by merging. A merge only argues when both sides edited the same file — so
the shell writes these files once and never touches them again, and the app
writes nothing anywhere else in shell code. Neither side is ever in the other's
file, so there is nothing to reconcile.

- `options.ts` — the app's answers. Catalogue: `src/lib/app-options.ts`.

The catalogue defines what can be set and what each option means. Anything not
offered there is a compile error, on purpose: the shell always knows every way
an app can deviate from it. Need something that is not on offer? Add it to
custom-shell first, defaulting to today's behaviour — the procedure is in
`apps/custom-shell/CLAUDE.md`.

**In custom-shell itself this file stays empty forever.** A value here would make
every app ever copied from the shell conflict on it on every merge.
