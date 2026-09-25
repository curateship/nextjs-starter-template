# Pomodoro app docs

One line per doc. The repo's `docs/` covers what is true of every app; these
cover this one.

- [The product shell](product-shell.md) — the `_pomodoro` layout: the app's
  own sidebar, header and settings page; the admin chrome is never the
  frontend.
- [The Pomoder look](pomoder-look.md) — the ported design tokens, fonts and
  orange accent for the member-facing screens, and the PomodoroScreen wrapper
  that switches them on.
- [The timer](timer.md) — the ring at `/timer`, the 4-focus cycle, auto-start,
  and the session rows and daily stats every run writes.
- [Tasks](tasks.md) — today's plan: create, inline edit, drag to reorder,
  complete and abandon, and the focus task the timer counts on.
- [Timer settings and rhythm presets](timer-settings.md) — the Settings →
  Timer tab: durations, daily goal, auto-start, and built-in plus custom
  rhythms.
- [Pro perks](pro-perks.md) — what a paid plan unlocks and the one module
  that answers every can-do question.
- [Profile](profile.md) — public display name, the day-boundary timezone and
  the leaderboard opt-in.
- [Sounds](sounds.md) — the eight ambient loops, the header player that
  survives navigation, the sleep timer and the completion chime.
- [Backgrounds](backgrounds.md) — the eight scenes and the backdrop every
  member screen draws behind its content.
- [Focus history](history.md) — the four-range report: stats, heatmap,
  trend, top tasks, sessions table and CSV export.
- [Guest mode and the one-time import](guest-mode.md) — the whole product
  without an account, and the first sign-in copying it over exactly once.
- [The front page](landing-page.md) — `/` is the timer, for guests and
  accounts alike.
- [Leaderboard](leaderboard.md) — the opt-in weekly ranking and your own
  stat cards.
- [Focus rooms](rooms.md) — shared timers with a host, the fifteen-second
  server clock, SSE snapshots and invite links.
- [Room chat and moderation](room-chat-and-moderation.md) — talking in a
  room, the five reactions, reporting a message, and the host's delete,
  remove and ban.
