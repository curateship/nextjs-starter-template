# Leaderboard

`/leaderboard`: your own stat cards (focus today, this week, current and
best streak, tasks done this week), a 7-day sessions chart, and the global
ranking.

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
  Top 100 by focus time in every window.
- **The browser sends a word, never a date.** One of `week`, `month` or `all`,
  and the server works the start date out (`leaderboardStartDate` in
  `src/lib/pomodoro/leaderboard-windows.ts`), so no caller can ask for a wider
  scan than the three tabs offer.
- **The old app said "this week" and summed all time.** That bug stopped when
  this screen was ported, and This week still means the last 7 days.
- **One window runs both boards.** Picking This month moves the global ranking
  and every [private group](focus-groups.md) board with it. The ranking query
  is shared, so a figure cannot differ between the two.
- **Guests** see their local stats and a sign-in card in place of the
  ranking.
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
