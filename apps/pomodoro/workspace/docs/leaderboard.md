# Leaderboard

`/leaderboard`: your own stat cards (focus today, this week, current and
best streak, tasks done this week), a 7-day sessions chart, and the global
ranking.

- **Opt-in only, display names only.** An account appears only after
  turning on "Show me on the leaderboard" in Settings AND choosing a
  public display name; real names and emails never show. Avatars are
  coloured initials seeded from the display name — the old stock faces
  were not ported.
- **The window really is the week.** The old app said "this week" but
  summed all time; the query in
  `src/lib/api/pomodoro/leaderboard.ts` sums the last 7 local days only
  (each account's own calendar days, the week anchored on the viewer's
  timezone). Top 100 by focus time.
- **Guests** see their local stats and a sign-in card in place of the
  ranking.
- **The header pill opens the top five.** The Leaderboard pill in the
  product header is a popover, not a link to the page: this week's top
  five with rank, initials, name and session count, your own row in the
  accent colour, and "Full leaderboard" at the foot for the page itself.
  It reads the same ranking the page does, with the same opt-in rule, and
  it only asks for it when the popover is opened. The sidebar still has a
  Leaderboard link, so nothing lost a way in.
