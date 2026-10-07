# Reporting and blocking

Two protections, both of them here because of what the public profile does.
[The profile](public-profile.md) puts member-uploaded pictures, free-text bios
and links on the open internet, and [following](following.md) lets a stranger
follow one named person and send them things. Neither is safe without these.

## Reporting a profile

A Report button sits on every public profile, beside Follow.

- **A signed-out reader can report.** The page is public and most of its
  readers have no account, so a report that required one would mostly never be
  filed. The report records the account when there is one and nothing when
  there is not.
- **Six reasons, no typing.** A fixed list, for the same reason room reactions
  are five emoji: a typed explanation is itself something an operator has to
  read and moderate.
- **Six reports an hour from one address.** A public page has no account to
  count against, so the count is by address, through the same rate limiter
  sign-in uses. It is a limit and not a guard, which is why the endpoint is
  written down in `src/app/open-endpoints.ts` with its reason.
- **Every report answers the same way.** An unknown handle, a profile that is
  switched off, your own profile and a real report all give the same thanks.
  Nobody can use the Report button to find out which handles exist.

### It lands in the queue an operator already works

Profile reports go into `room_reports`, the same table and the same page at
`/admin/pomodoro-reports` that room messages use. A second queue would be a
second thing to remember to open.

Two columns stopped being required for this: a profile belongs to no room, and
a signed-out reader is no reporter. A `kind` column says which sort a row is,
and defaults to `message`, which is what every row written before today is.

The operator page names a message report by its room and a profile report by
its address, so a row reads the same way whichever it is.

### Hiding is the only power over a profile

Tyler's call, 2 Oct 2026, out of four options: hide only, hide plus clearing
the bio and picture, hide plus suspending the account, or all three. Clearing
a field and suspending an account are different powers and each needs its own
decision.

- Hiding sets `hidden_at`, which the public read already tests, so a hidden
  profile answers exactly the 404 a switched-off one does. There is no second
  kind of 404 to get wrong.
- The owner is told, on their own Settings card, in a plain line. They are not
  left thinking the app broke.
- The hide is written to `pomodoro_audit_logs`, and it drops the held copy of
  the page, so it takes effect on the very next request.
- Hiding leaves the report's own standing alone. An operator still resolves or
  dismisses it afterwards, exactly as they would a message.

## Blocking an account

Block is on a profile and undone in Settings.

- **It works in both directions.** The row records who blocked whom, so the
  question "who did this" stays answerable, but the check reads it both ways.
  Neither of you sees the other anywhere.
- **It tears down any follow between you**, in the same transaction. A block
  that left the follow in place would keep you both on each other's boards,
  which is the thing the block is for.
- **There is no cap.** Tyler's call, 2 Oct 2026: refusing a block costs the
  person being harassed far more than a long list costs the database.
- **The blocked person learns nothing.** Their view of your profile is the
  same 404 as a profile that was never there. A cheer from them reports
  success and arrives nowhere. No list ever says somebody was removed from it.

### The check lives in one function

`isBlockedBetween` and `blockedUserIdsFor`, both in
`src/server/pomodoro/blocks.ts`, and nothing else. A block that held on the
profile page and leaked through the leaderboard would be four separate bugs
rather than one, so there is no second copy to drift.

Every list calls one of them:

- the global leaderboard and a group board, through `readLeaderboardRows`
- the Following tab, which is that same query filtered
- the following feed
- a room's member list and its chat, through `roomSnapshot`
- the public profile, and the year recap
- `/users`

`blockedUserIdsFor` answers with a set for a whole page, so a hundred-row
board costs one extra query rather than a hundred.

### Unblocking

In Settings → Privacy, in a card that is not drawn at all when nobody is
blocked. It is undone there and nowhere else, because once you have blocked
somebody their page is a 404 to you, so there is no Unblock button to put on
it. Unblocking does not restore the follows the block removed.
