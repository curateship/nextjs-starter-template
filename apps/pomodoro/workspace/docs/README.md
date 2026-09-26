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
- [The tab countdown](tab-countdown.md) — the time left in the browser tab's
  title and a filling ring in its icon, the worker that keeps them moving in a
  background tab, and how both go back on stop.
- [Zen mode](zen-mode.md) — the fullscreen timer: the ring, the phase and
  the task name, how you get in and out, and why the countdown never notices.
- [Tasks](tasks.md) — today's plan: create, inline edit, drag to reorder,
  complete and abandon, the focus task the timer counts on, and the repeat
  rule that brings a task back each morning.
- [Projects](projects.md) — grouping tasks at the level people bill at, what
  archiving does, and the per-project split in History.
- [Session notes](session-notes.md) — the one line you jot after a focus
  finishes, why it never interrupts the break, and where it shows up.
- [Sessions before the long break](sessions-before-long-break.md) — how many
  focuses earn the long break, why it belongs to each preset, and what
  changing it does to the count.
- [Timer settings and rhythm presets](timer-settings.md) — the Settings →
  Timer tab: durations, daily goal, auto-start, and built-in plus custom
  rhythms.
- [Pro perks](pro-perks.md) — what a paid plan unlocks and the one module
  that answers every can-do question.
- [Profile](profile.md) — public display name, the day-boundary timezone and
  the leaderboard opt-in.
- [Streak badge](streak-badge.md) — the opt-in image you can embed on a blog,
  the secret address that serves it, and what revoking does.
- [Sounds](sounds.md) — the eight ambient loops, the header player that
  survives navigation, the sleep timer and the completion chime.
- [Backgrounds](backgrounds.md) — the eight scenes and the backdrop every
  member screen draws behind its content.
- [Focus history](history.md) — the four-range report: stats, heatmap,
  trend, top tasks, sessions table and CSV export.
- [Achievements](achievements.md) — the ten badges, the panel above the
  focus report, and why a badge can only ever be awarded once.
- [Guest mode and the one-time import](guest-mode.md) — the whole product
  without an account, and the first sign-in copying it over exactly once.
- [The front page](landing-page.md) — `/` is the timer, for guests and
  accounts alike.
- [Leaderboard](leaderboard.md) — the opt-in weekly ranking and your own
  stat cards.
- [Focus rooms](rooms.md) — shared timers with a host, the fifteen-second
  server clock, SSE snapshots and invite links.
- [Scheduled rooms](scheduled-rooms.md) — booking a room for later, the
  invitation emails, and the worker that opens the room on time.
- [Room chat and moderation](room-chat-and-moderation.md) — talking in a
  room, the five reactions, reporting a message, and the host's delete,
  remove and ban.
- [Admin sections](admin-sections.md) — the six operator pages under
  `/admin`: focus data, tasks, sessions, rooms, media, and the report queue
  with its resolve, dismiss and reopen.
- [Your own backgrounds and sounds](own-media-uploads.md) — what a Pro member
  may upload, the FFmpeg re-encode, and where the files live.
- [AI backgrounds and soundscapes](ai-generation.md) — the prompt box, the
  monthly credits, and the rule that a failed generation is refunded.
