# Timer settings and rhythm presets

The product's Settings page (`/settings`, card
`src/components/pomodoro/timer-settings-panel.tsx`) holds the old app's
"Focus rhythm" card: the three durations (1-90 minutes each), the daily goal
(1-20), how many focuses come before the long break (2-8), auto-start, and the
rhythm presets. The long-break number has its own doc,
[Sessions before the long break](sessions-before-long-break.md).

## Presets

- **Three built-ins live in code** (`src/lib/pomodoro/timer-presets.ts`),
  ids and values part of the product contract: Classic 25/5/15 with the long
  break after 4, Deep Work 50/10/30 with the long break after 2, Study Sprint
  15/3/10 after 4 with auto-start.
- **Custom presets** (name, three durations, the long-break number,
  auto-start) live in the `user_timer_presets` table (migrations
  `0084_pomodoro_timer_presets.sql` and
  `0099_pomodoro_sessions_before_long_break.sql`),
  at most 10 per person, names unique per person regardless of case. The
  server locks the owner's row per change, so two simultaneous creates can
  never both pass the count or name checks
  (`src/server/pomodoro/timer-presets.ts`).
- **The picker shows "Custom"** when the current five values match no
  preset, and names the match when they do. A preset row's small print reads
  `25 · 5 · 15 · long after 4`, plus `· auto` when it auto-starts.
- **Applying goes through the server** (`applyTimerPreset` in
  `src/lib/api/pomodoro/timer-presets.ts`), which refuses with
  TIMER_RUNNING while a focus session is genuinely mid-countdown — a
  running row whose end moment is still ahead. A stale paused row from a
  closed tab does not block it. Deleting a preset removes only the stored
  preset, never the saved preferences or a timer in progress.

The tab edits the same `user_preferences` row the dashboard reads on load,
so the next visit to `/timer` picks the new rhythm up.

## While it is loading

The card shows "Loading your focus rhythm…" in place of the preset picker and
the number fields until the saved row arrives. Three empty boxes read as a
rhythm of nothing, and a number typed into one of them would be overwritten the
moment the load landed. If the load fails the card says so and offers a reload
instead of spinning for ever. The Profile tab does the same with its own fields
for the same reason.
