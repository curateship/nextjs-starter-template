# Leaderboard

`/leaderboard`: your own stat cards (focus today, this week, current and
best streak, tasks done this week), a 7-day sessions chart, and the global
ranking.

- **Opt-in only, display names only.** An account appears only after
  turning on "Show me on the leaderboard" in Settings AND choosing a
  public display name; real names and emails never show. Avatars are
  coloured initials seeded from the display name — the old stock faces
  were not ported.
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
