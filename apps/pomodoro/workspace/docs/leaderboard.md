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
