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
- The owner is told, on their own Settings card, in a plain line, and in the
  bell (see Notices below). They are not left thinking the app broke.
- The hide is written to `pomodoro_audit_logs`, and it drops the held copy of
  the page, so it takes effect on the very next request.
- Hiding leaves the report's own standing alone. An operator still resolves or
  dismisses it afterwards, exactly as they would a message.

## Reporting a shared file

Shared sounds and backgrounds have a Report too (uploads-and-sharing task 05,
10 Oct 2026): on the file's own page, which every shared card links to, and
beside the credit in a room. It works the way the profile's does: anybody can
send one, the reasons are a fixed list (copyright, not suitable, broken,
something else), the answer is the same thanks whatever happened, and the
budget is by address. One member files one report per file. It lands in the
same queue as "Shared file: <name>", with a preview of the file, who shared it,
and a sharing menu to Unshare it with a reason or delete it.

Someone with no account who owns a work a file copies uses `/copyright`
instead: name, email, the file's address, what it copies, and a statement they
tick. It lands as "Copyright: <name>", or "Copyright, outside" when the address
is not a shared file, with the sender's name and email on the row so the admin
can answer by email. Five an hour per address. See
[Shared sounds and backgrounds](shared-media.md).

## Notices

Who hears what when a report moves. Every one of these is in the bell
(`src/server/pomodoro/notices.ts`, words in `src/lib/pomodoro/notices.ts`) and
none of them names the reporter, the admin or the person reported.

- **Every active admin hears a report land:** "New report: a profile." or "New
  report: a room message.", leading to `/admin/pomodoro-reports`. More reports
  while that notice is unread fold into "4 new reports." An admin who files a
  report is not told about their own. A repeat report of the same chat line
  adds no row, so it tells nobody again.
- **Once nothing in the queue is open**, every admin's unread "new report"
  notice turns read, because there is nothing left for it to point at.
- **The reporter hears "Thanks, your report was reviewed."** when it is
  resolved or dismissed. The words are identical for both on purpose:
  different words would let a reporter learn what happened to somebody else.
  It is once per report, kept by `room_reports.reporter_told_at`, so reopening
  and closing again says nothing; one press closing several of one person's
  reports is one notice. A signed-out reporter has no bell and hears nothing.
- **A hidden profile's owner hears "Your public profile has been hidden. See
  Settings for what to do."**, leading to Settings → Public page, as well as
  the line on that card. Hiding a profile already hidden says nothing again.
- **Showing it again from the Bans page tells the owner too**: "Your public
  profile is visible again." Reopening a report and pressing Show again from
  Room reports still says nothing, as before.
- **Each report row counts the past** (8 Oct 2026): how many times the person
  it is about was reported before it, and how many of the reporter's earlier
  reports were dismissed. Either count opens the reports by or about that
  person. Warn and Suspend sit under the reported message. See
  [Admin safety tools](admin-safety-tools.md).

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
