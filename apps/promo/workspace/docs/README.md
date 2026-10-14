# Promo's own documents

What is true of this app. What is true of every app built on the shell lives in
the repo's `docs/`, and is never copied here.

## How the code is laid out

- [Where the code lives](where-the-code-lives.md) — what every network shares,
  what belongs to Reddit alone, and how to add the next one.

## Projects

- [The Projects dashboard](projects-dashboard.md): the table of every project,
  and one project's description, accounts, keywords and posts on one screen, which account comments, what the
  AI is told about what you make, the order accounts are listed in, pausing a
  project, and the Today page of every project's best posts and waiting replies.

## Reddit

- [The Reddit accounts dashboard](reddit/accounts-dashboard.md): every account
  with its status (Warming up, Ready, Working, Banned), project, profile and
  proxy, adding one, setting a status by hand, pausing, help-only posts, and
  retiring.
- [Finding posts worth answering](reddit/finding-posts.md) — what a keyword is,
  watching a subreddit, why there is no Reddit API, how the order is worked
  out, the Everything list, searching the posts, the best posts' replies read
  ahead, the subreddits you never see,
  how old posts are tidied away, searching again by itself every few hours,
  ideas for keywords, and each subreddit's self-promotion thread.
- [Link posts](reddit/link-posts.md) — reading the title and opening of the
  page a post links to, the guard that refuses any address inside the network,
  and how the page is labelled for the AI.
- [Writing the comment](reddit/writing-comments.md) — what the AI is told, the
  subreddit's own rules, the sent comments it copies the voice of, what comes
  back, why Post is sometimes off, checking a comment against the rules,
  rewriting it, what you said before, and ten seconds to undo.
- [What happened to your comments](reddit/sent-comments.md) — the Comments
  screen: every sent comment with its upvotes, its replies and whether it is
  still there, the switch that keeps it out of the AI's examples, removals per
  subreddit, deleting and editing a comment, and the Failed tab.
- [Posts of your own](reddit/your-own-posts.md): New post on a project, the
  subreddit's rules first, the same rules as Post, and the Posts tab.
- [Answering replies](reddit/answering-replies.md) — the Replies window on the
  Comments screen: the replies under a sent comment, drafting and sending an
  answer from the same account under Post's rules, and how an answer is stored.
- [How Reddit sees the account](reddit/account-health.md) — karma, account age,
  and whether a stranger can see the profile, read once a day and on request.
- [Reddit on phones](reddit/reddit-on-phones.md): who is signed in, the health
  reading and the comment done in the real Reddit app, finding a phone
  comment's link, the Post button naming its device, and moving an account
  from a browser profile to a phone.

## Accounts

- [Behaving like a person](accounts/behaving-like-a-person.md) — the reader
  browser that searches so accounts never do, the visit around every comment,
  waking hours, warm-up, the pace limit for young accounts, clicks and
  scrolls like a hand, and help-only comments that build karma. Settings → Behaviour.
- [Important and throwaway accounts](accounts/important-and-throwaway.md): the
  two groups, marking one important for good, and everything Promo refuses
  that would link them.

## The browser

- [The isolated browser](browser/isolated-sessions.md) — Camoufox in a container,
  the pinned image, one identity per profile, checking what a website sees,
  signing in once, the proxy, the limit on how many run at once, profiles
  working side by side, why only the browser program opens one, and how a dead
  or leftover one is cleared.
- [The Jobs dashboard](browser/jobs-dashboard.md): last under Projects in the
  left menu. Whether the browser program is running and how to start it, and
  every search, read, comment and check it is running, waiting to run,
  finished or failed, with Cancel and Try again.
- [Browser profiles](browser/profiles.md) — one isolated browser as a record of
  its own, which an account points at, and how the first accounts were adopted.
- [The Browser profiles dashboard](browser/profiles-dashboard.md) — the table,
  the browser inside the app, a profile's backups and history, folders, labels
  and tags.
- [Backing a profile up](browser/backups.md) — the volume, encrypted with the
  server's key and kept in R2, restoring it here or on another machine, and the
  newest five kept.
- [The Proxies dashboard](browser/proxies-dashboard.md) — the table, pasting in
  a list, the re-test that reaches every proxy, the dead-proxy notice, the
  record of each proxy's outside address, and what each costs and when it renews.

## Phones

- [The Phones dashboard](phones/phones-dashboard.md): every Android phone on
  the rack as a record, its status (Connected, Offline, Busy, Held), the shelf
  slot, the five tabs of its window, app versions on each row, the Mix window,
  and an account that runs on a phone instead of a browser profile.
- [The rack program](phones/rack-program.md): the program at home that drives
  the phones, how it reaches Promo without opening a port, the named actions,
  pairing with a one-time code, signed messages, Disconnect, the one install
  command, and updating itself with a rollback.
- [Jobs on phones](phones/phone-jobs.md): a phone account's jobs through the
  same job list, one at a time per phone and side by side across phones, the
  phones' own limit, waking hours on the phone's clock, an offline phone
  refusing at once, pausing the rack, and Settings → Phones.
- [A phone's screen window](phones/screen-window.md): the live picture, control
  and the hold while a person taps, authenticator codes and texted codes.
- [A phone's health](phones/phone-health.md): what the rack reads once a
  minute, the bell for a phone offline, hot, with no signal or nearly full and
  for the rack going quiet, the four-week battery and heat chart, and each
  phone's history.
- [Freezes and ban screens](phones/freezes-and-ban-screens.md): a frozen app
  reopened and a frozen phone restarted without anything being sent twice,
  and an app's suspended, locked or "confirm it's you" screen stopping the
  account at once.
- [A picture of every step](phones/step-pictures.md): each action's named
  steps with a screenshot, kept encrypted in R2, how long they are kept, and
  clearing a failed one's.
- [Making each phone look like one person's](phones/looking-like-a-real-person.md):
  the setup check, what the platform sees, wiping a phone between accounts,
  the rack mix warning, and Wi-Fi phones that must show their proxy's address.
- [The daily self-test and app updates](phones/self-test-and-app-updates.md):
  the spare test phone, walking each action to its last button without
  pressing it, broken actions refused, and app updates on the test phone
  first.

## Writing

- [The Voices dashboard](voices-dashboard.md) — how the AI sounds and the lines
  it must not cross, as a record any number of accounts share, how the
  first account's words moved, and trying a voice on a real post.

## Notices

- [Promo's bell notices](notices.md): new replies, removed comments, suspended
  accounts, failures, proxy renewals and phone problems, one notice per thing,
  and where each opens.

## Shell

- [What promo changes about the shell](shell-integration.md) — the options it
  sets, the tables it owns, and the fact that it forks no shell file.
