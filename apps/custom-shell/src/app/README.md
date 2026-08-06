# src/app — the app's answers

This folder belongs to the app, not the shell. It is the only place an app
changes how the shell behaves.

Apps are made by copying this whole repo, and shell improvements reach them
later by merging. A merge only argues when both sides edited the same file — so
the shell writes these files once and never touches them again, and the app
writes nothing anywhere else in shell code. Neither side is ever in the other's
file, so there is nothing to reconcile.

- `options.ts` — the app's answers. Catalogue: `src/lib/app-options.ts`.
- `server-options.ts` — the answers that only run on the server. Catalogue:
  `src/server/app-options.ts`.

Two files because of one line: everything in `options.ts` can be seen by the
browser, and everything in `server-options.ts` never is. Drawing and wording go
in the first; anything that reaches the database or calls something outside goes
in the second. An automation step an app adds is split across both — how it
draws in one, what it does in the other.

Each catalogue defines what can be set and what each option means. Anything not
offered there is a compile error, on purpose: the shell always knows every way
an app can deviate from it. Need something that is not on offer? Add it to
custom-shell first, defaulting to today's behaviour — the procedure is in
`apps/custom-shell/CLAUDE.md`.

A public page the app adds is a new route plus a `*.page.ts` beside it, and it
belongs in `src/routes` like any other — no option, no entry in this folder.
**Write `source: "app"` in that declaration.** Nothing can work it out
otherwise, since the app's pages and the shell's share one folder, and it is
what makes the Pages screen say which of them is yours. Leaving it out only
costs you the label.

New server functions still go in `src/lib/api/`, never here: the guard test only
walks that folder, so an endpoint declared in this one would be an unguarded
door nobody is told about.

**In custom-shell itself both files stay empty forever.** A value here would make
every app ever copied from the shell conflict on it on every merge.
