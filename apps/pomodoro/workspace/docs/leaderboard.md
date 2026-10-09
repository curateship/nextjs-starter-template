# Leaderboard

`/leaderboard`: the global ranking, then Who you focus with and Your groups
side by side. Your own stat cards and the 7-day sessions chart moved to
[Focus history](history.md) on 7 Oct 2026, on Tyler's word.

## How the page looks

Drawn to Tyler's design of 7 Oct 2026 (`assets/pasted-image-1791398305993222000.png`).

- **The header:** a large "Leaderboard" title and one line under it. The line
  reads "Focus time across everyone on pomodoro." on Everyone and "Focus time
  across the people you follow." on Following.
- **The tabs sit to the right of the title:** Everyone and Following in one
  round pill, This week, This month and All time in another. They are as large
  and round as the timer's mode tabs, because the design draws them that way.
  On a phone they drop under the title.
- **Three panels share one look:** 24px corners, a small capitals label on the
  left and the period on the right (`panel-card.tsx`, shared with the profile and History).
- **The ranked rows:** place, initials, name, focus time and the session count,
  with no box around a row. Places 1 to 3 read brighter than the rest. Your own
  row has an orange border and tint. A phone hides the session count so the
  name keeps its room.
- **The two empty states are centred.** Who you focus with shows three dashed
  circles and a Browse focus rooms button that opens `/rooms`. Your groups
  shows Create a group and Join with a link as round buttons.
- **People you follow** (the badges your follows earned) is not in the design.
  It stays under the two panels and draws nothing when there is nothing to
  show.

- **Opt-in only, display names only.** An account appears only after
  turning on "Show me on the leaderboard" in Settings AND choosing a
  public display name; real names and emails never show. Avatars are
  coloured initials seeded from the display name — the old stock faces
  were not ported.
- **A row is never blank.** Every board's query already leaves out anyone
  with no display name, so this should never be needed. If a nameless row
  ever does arrive, the row reads "Someone", the word the header's leaderboard
  already uses, and the initials show "?". A screen reader then hears a place,
  "Someone" and a time, never a place and a time with nobody
  (`leaderboard-rows.tsx`).
- **Three windows, and This week is the default.** Tabs for This week, This
  month and All time. This week is the last 7 local days, This month is the
  calendar month, All time is everything since 1 January 2025 (a floor, so the
  query is one indexed date rather than every row there has ever been). Each
  account's days are its own calendar days, anchored on the viewer's timezone.
  Top 100 by focus time in every window. Equal times are ordered by account,
  so the order does not shuffle between reloads.
- **The browser sends a word, never a date.** One of `week`, `month` or `all`,
  and the server works the start date out (`leaderboardStartDate` in
  `src/lib/pomodoro/leaderboard-windows.ts`), so no caller can ask for a wider
  scan than the three tabs offer.
- **The old app said "this week" and summed all time.** That bug stopped when
  this screen was ported, and This week still means the last 7 days.
- **One window runs both boards.** Picking This month moves the global ranking
  and every [private group](focus-groups.md) board with it. The ranking query
  is shared, so a figure cannot differ between the two.
- **Guests** see a sign-in card in place of the ranking.
- **The header pill opens the top five.** The Leaderboard pill in the
  product header is a popover, not a link to the page: this week's top
  five with rank, initials, name and session count, your own row in the
  accent colour, and "Full leaderboard" at the foot for the page itself.
  It reads the same ranking the page does, with the same opt-in rule, and
  it only asks for it when the popover is opened. The sidebar still has a
  Leaderboard link, so nothing lost a way in.

## The choices are in the address

Everyone or Following, and This week, This month or All time, live in the page
address: `/leaderboard?show=following&window=month`. A reload or Back keeps
them, and a link can open one view. Everyone and This week are the plain
`/leaderboard`, and anything unknown falls back to them
(`src/routes/_pomodoro/leaderboard.tsx`). Clicking a tab replaces the address
rather than adding to it, so Back leaves the page.

## Your own row

Your row has the accent tint and a small "You" beside your name, on the
global board, the Following board and every group board, because they share
`leaderboard-rows.tsx`. The tint alone said nothing to a screen reader or with
the colour ignored. The header's leaderboard popover adds "· you" after your
name for the same reason.

**Below the first hundred, your row still shows.** It sits under the list,
past a divider, with your real place, so 150th reads "150", your name and your
time. The place counts the listed people above you by the board's own order,
leaving out anyone blocked either way, since the list leaves them out too.
Only the global board does this: a group holds 50 at most, and the Following
board never has you on it. The server sends the row as `you` beside
`leaders`, from `readYourPlace` in `src/server/pomodoro/leaderboard.ts`, and
sends nothing when you are in the hundred or not listed at all.

## When you are not on it

A signed-in member missing from the global board sees one line above the
ranking that says why, with Settings as a link to the Profile tab:

- **The switch is off:** "You are not on this board. Switch it on in Settings
  to take your place." The switch is off by default, so this is most new
  members.
- **The switch is on but there is no display name:** "You are not on this
  board yet. Pick a display name in Settings to take your place."

The answer rides on the board's own load (`youAreHidden` in
`src/lib/api/pomodoro/leaderboard.ts`), from the profile row that load already
reads, so it costs no extra request. It is the same two conditions the ranking
query lists people by. The line stays off on the Following board, which is the
people you follow and never you, and on an empty board, whose own message
already explains the switch. Somebody on the board sees nothing.

## When an admin takes you off

An admin can take somebody off the board from `/admin/pomodoro-leaderboard`,
for a leader whose hours look made up. Tyler's case: someone showing 23 hours
a day. Taken off means:

- **Gone from the global board and every focus group's board**, from the next
  read. Their place under the list goes too.
- **Still on the Following board** of anyone who follows them, because that
  board is people you chose to see.
- **Their profile is untouched.** Their page, figures and badges stay as they
  were.
- **Their own switch is kept.** "Show me on the leaderboard" stays as they set
  it, so putting them back restores exactly what they chose.
- **They are told where they look.** Settings → Profile says "You're not shown
  on the leaderboard." under the switch, and the leaderboard page says the
  same line in place of the "switch it on" one. Nothing goes to the bell, and
  neither line names the admin.
- **It lasts until an admin puts them back.** There is no end date.

The admin page's Board tab is the global board as members see it, a hundred
people at most, with one more column: the hours a day on the days they
focused. A week with one 23-hour day reads 23.0h, not 3.3h, so the pattern
stands out. The admin's week starts on the UTC calendar day, so it can be a
day either side of what a member in another timezone sees. The Taken off tab
lists everyone off the board, with who did it and when. Both moves are one
request over one row or every ticked row, logged in `pomodoro_audit_logs` as
`leaderboard_hide` and `leaderboard_show`. The code is
`src/server/pomodoro/admin-leaderboard.ts`; the rule that keeps them off is
`globalBoardRule` and the group branch in `leaderboard.ts`.

## When the board fails to load

The ranking card says "The leaderboard could not be loaded" inside the card,
with Try again, which asks again without reloading the page. It used to sit at
the top of the page and tell you to reload. Switching tabs or windows and
getting an answer takes the warning down. The "Your stats" cards and chart
still fail in silence, which was offered as a fix and turned down.

## Names on the board are links

A display name belonging to somebody with a public profile links to it. A name
without one draws as plain text, exactly as every name did before profiles
existed, so no row ever links to a page that answers 404. The handle is
selected beside the name in the one ranking query, so the board costs no extra
read per row.

## The Following tab

Beside the three windows there are now two boards: Everyone, and the people
you follow. The Following tab is the same ranking query with a filter on who
is allowed in it, never a second query, so the two boards cannot disagree
about a figure. See [Following](following.md).

Somebody blocked in either direction appears on neither board. See
[Reporting and blocking](reporting-and-blocking.md).

## Who you focus with

Under the ranking, a card lists the five people you have shared the most room
time with in the last 12 months. Both of you need the leaderboard opt-in and a
display name. How the time is worked out is in [Focus rooms](rooms.md).
