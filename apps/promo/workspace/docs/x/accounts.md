# X accounts

Adding an X account, signing it in, and what Promo reads and stops about it
(parts 1, 2, 6, 7, 8, 27, 41, 42, 43, 44 and 46 of
`workspace/tasks/X/01-x-features.md`).

## Adding one

Add account on the Accounts dashboard offers X with either a browser profile
or a phone. Tyler, 21 Oct 2026: "Both from the start". An important account
still runs on a phone only ([Important and throwaway accounts](../accounts/important-and-throwaway.md)).
A profile that searches X is never offered ([Search accounts](search-accounts.md)).

## Signing in

- **In a browser**: sign in by hand in the profile's browser window on the
  Browser profiles dashboard, then press Check now.
- **The sign-in code** (part 6): an account with its authenticator secret saved
  has Send sign-in code, which types X's six-digit code into its browser when
  X asks. The code is worked out the moment it is typed and never stored.
- **On a phone**: sign in in the X app through the phone's screen window.
- **Who is signed in** is read after every X job, with followers and when X
  says it joined. Its 7-day warm-up counts from that date, or from when Promo
  first saw it signed in.

## Lock screens

X locks new accounts more than any network Promo uses. A lock, suspension,
"temporarily limited" or "confirm it's you" screen (part 7), found after any
job in the browser or on a phone, stops the account at once: it is marked
blocked with X's own words, its waiting jobs are dropped, the job is failed and
not tried again, and the bell rings "Ban screen:". Nothing more goes out as it
until a person lets it run again from the Accounts dashboard.

## The daily look from outside

Once a day a search account looks at each X account the way a stranger would
(parts 42 and 43):

- **Followers and views.** Its followers off its page, and the views on its
  replies and posts as their last checks read them, kept one row a day and
  drawn day by day on the Accounts dashboard.
- **Whether X hides it.** Its latest reply is looked for in X's search and under
  its post. Not found in search is "Hidden from search"; folded behind "Show
  more replies" is "Replies folded". X never says, so the words call it
  Promo's best guess. The bell rings when the look first finds it ("X may be
  hiding @name"), and the Accounts dashboard shows it beside the status.

Check now on an X account takes the look straight away.

## Its own switches

In each X account's Settings window on the Accounts dashboard:

- **Paid** (part 27): posts up to 1,000 characters from Promo (X allows more,
  but the browser types at a person's pace) and edits within X's hour.
- **Follow the people it replies to** (part 44), off to begin with.
- **Every Nth reply starts as Help only** (part 24), 0 for never.
- **Its followers and views**, drawn day by day (part 43).

The row itself shows how long the account has been on X, the daily look's
guess beside its status, and a key button that sends the sign-in code when
its authenticator secret is saved.

## Direct messages

X's direct messages are on the Messages dashboard beside Reddit's,
Instagram's and TikTok's (part 41), answered only on a press.

- **On a phone**, the rack reads X's notifications once a minute, and a message
  notification reads the inbox, as for Instagram.
- **In a browser** there are no notifications, so Promo reads the inbox every
  three hours in the account's waking hours. A conversation is named by the
  other person's @handle, and the answer opens their conversation in the
  account's browser.
- **A conversation read on a phone** is named by the person's display name,
  which may be someone else's @handle. After an account moves from a phone to a
  browser, Send refuses those conversations until the browser reads the inbox
  again, so an answer never goes to a stranger.

## Moving to a phone

A throwaway X account that turned valuable moves from its browser profile to a
rack phone (part 46) the way a Reddit account does
([Reddit on phones](../reddit/reddit-on-phones.md)). On a phone the X app
replies, quotes, posts one post at a time, follows and warms up.

## The warm-up

Once a day in its first 7 days, in its waking hours, an account visits X: the
home feed and a search or two on its project's words, read only. Nothing is
liked, reposted, followed or written.

## Where it is

- `src/server/social/x/run.ts`: who is signed in, the lock screen stop, the code.
- `src/server/social/x/reach.ts`: the daily look.
- `src/server/social/x/warm-up.ts`.
- `src/server/social/phone-apps/inbox.ts`: the Messages dashboard, X in a browser
  included.
- `rack/promo_rack.py`: the X app's steps on a phone.
