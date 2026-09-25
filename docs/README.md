# Docs

Everything written down about this repo that is not about one app in
particular.

An app's own documentation does not live here. It lives in that app's
`workspace/docs/` folder, which is the folder the Personal IDE shows in its Docs
tab. If a doc is true of only one app, it belongs there.

## The repo

- `how-we-work.md` — how a discussion with Tyler goes, when a plan is wanted,
  and what counts as evidence. Read with the `unslop` skill.
- `monorepo.md` — what is in the repo, which apps are live, how the workspaces
  fit together.
- `local-enviroment.md` — ports, dev servers, and why a running port belongs to
  one worktree.
- `deployment.md` — how the apps get to production.
- `scalability.md` — what holds up as the load grows.

## The shell, in `docs/shell/`

Custom Shell is the template every app is copied from, so these files are true
of Custom Shell, Trade, CMS and Video alike. They live here once. Copying them
into an app is what caused the mess this folder replaced: the same five files
sat in thirteen app folders, and nothing read them.

- `shell-and-apps.md` — the rulebook. How an app is made from the shell, what an
  app may edit, and how app options work.
- `what-lives-where.md` — the folder map every app shares. Where a new file
  goes.
- `working-rules.md` — how to scope a change, run the tests and the type check,
  and prove a screen works.
- `architecture-overview.md` — the shell's layout, navigation and what it owns.
- `saas-foundation.md` — accounts, roles, plans, entitlements and Stripe.
- `security.md` — sessions, passwords, authorization, payments, uploads.
- `user-interface.md` — the shell's own UI rules. The full standard is the
  `Ui-standards` skill in `.agents/skills/`.
- `public-files.md` — `robots.txt` and the sitemap, including what happens when
  a site has more addresses than one sitemap file can hold.

## Writing a doc

Shell behaviour goes in `docs/shell/`. Repo behaviour goes here. Anything about
one app goes in that app's `workspace/docs/`. Add the file's line to the index
that covers it in the same turn, and write it the way
`.agents/skills/unslop/SKILL.md` says.
