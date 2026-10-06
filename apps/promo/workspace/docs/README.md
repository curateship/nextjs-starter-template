# Promo's own documents

What is true of this app. What is true of every app built on the shell lives in
the repo's `docs/`, and is never copied here.

## How the code is laid out

- [Where the code lives](where-the-code-lives.md) — what every network shares,
  what belongs to Reddit alone, and how to add the next one.

## Reddit

- [Finding posts worth answering](reddit/finding-posts.md) — what a keyword is,
  why there is no Reddit API, and how the order is worked out.
- [Writing the comment](reddit/writing-comments.md) — what the AI is told, what
  comes back, and why Post is sometimes off.

## The browser

- [The isolated browser](browser/isolated-sessions.md) — Camoufox in a container,
  the pinned image, one identity per profile, checking what a website sees,
  signing in once, the proxy, the limit on how many run at once, profiles
  working side by side, why only the browser program opens one, and how a dead
  or leftover one is cleared.
- [Browser profiles](browser/profiles.md) — one isolated browser as a record of
  its own, which an account points at, and how the first accounts were adopted.
- [The Browser profiles dashboard](browser/profiles-dashboard.md) — the table,
  the browser inside the app, a profile's backups and history, folders, labels
  and tags.
- [Backing a profile up](browser/backups.md) — the volume, encrypted with the
  server's key and kept in R2, restoring it here or on another machine, and the
  newest five kept.
- [The Proxies dashboard](browser/proxies-dashboard.md) — the table, pasting in
  a list, the re-test that reaches every proxy, the dead-proxy notice, and the
  record of each proxy's outside address.

## Writing

- [The Voices dashboard](voices-dashboard.md) — the words the AI is told, as a
  record any number of accounts share, and how the first account's words moved.

## Shell

- [What promo changes about the shell](shell-integration.md) — the options it
  sets, the tables it owns, and the fact that it forks no shell file.
