# Promo's own documents

What is true of this app. What is true of every app built on the shell lives in
the repo's `docs/`, and is never copied here.

## How the code is laid out

- [Where the code lives](where-the-code-lives.md) — what every network shares,
  what belongs to Reddit alone, and how to add the next one.

## Projects

- [The Projects dashboard](projects-dashboard.md): the table of every project,
  and one project's description, accounts, keywords and posts on one screen, which account comments, what the
  AI is told about what you make, and the order accounts are listed in.

## Reddit

- [The Reddit accounts dashboard](reddit/accounts-dashboard.md): every account
  with its status (Warming up, Ready, Working, Banned), project, profile and
  proxy, adding one, setting a status by hand, and retiring.
- [Finding posts worth answering](reddit/finding-posts.md) — what a keyword is,
  watching a subreddit, why there is no Reddit API, how the order is worked
  out, the Everything list, searching the posts, the subreddits you never see,
  and how old posts are tidied away.
- [Link posts](reddit/link-posts.md) — reading the title and opening of the
  page a post links to, the guard that refuses any address inside the network,
  and how the page is labelled for the AI.
- [Writing the comment](reddit/writing-comments.md) — what the AI is told, the
  subreddit's own rules, the sent comments it copies the voice of, what comes
  back, and why Post is sometimes off.
- [What happened to your comments](reddit/sent-comments.md) — the Comments
  screen: every sent comment with its upvotes, its replies and whether it is
  still there, and the switch that keeps it out of the AI's examples.
- [How Reddit sees the account](reddit/account-health.md) — karma, account age,
  and whether a stranger can see the profile, read once a day and on request.

## Accounts

- [Behaving like a person](accounts/behaving-like-a-person.md) — the reader
  browser that searches so accounts never do, the visit around every comment,
  waking hours, warm-up, the pace limit for young accounts, and clicks and
  scrolls like a hand. Settings → Behaviour.

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

- [The Voices dashboard](voices-dashboard.md) — how the AI sounds and the lines
  it must not cross, as a record any number of accounts share, and how the
  first account's words moved.

## Shell

- [What promo changes about the shell](shell-integration.md) — the options it
  sets, the tables it owns, and the fact that it forks no shell file.
