# Timer settings and rhythm presets

The product's Settings page (`/settings`, card
`src/components/pomodoro/timer-settings-panel.tsx`) holds the old app's
"Focus rhythm" card: the three durations (1-90 minutes each), the daily goal
(1-20), auto-start, and the rhythm presets.

## Presets

- **Three built-ins live in code** (`src/lib/pomodoro/timer-presets.ts`),
  ids and values part of the product contract: Classic 25/5/15, Deep Work
  50/10/30, Study Sprint 15/3/10 with auto-start.
- **Custom presets** (name, three durations, auto-start) live in the
  `user_timer_presets` table (migration `0084_pomodoro_timer_presets.sql`),
  at most 10 per person, names unique per person regardless of case. The
  server locks the owner's row per change, so two simultaneous creates can
  never both pass the count or name checks
  (`src/server/pomodoro/timer-presets.ts`).
- **The picker shows "Custom"** when the current four values match no
  preset, and names the match when they do.
- **Applying goes through the server** (`applyTimerPreset` in
  `src/lib/api/pomodoro/timer-presets.ts`), which refuses with
  TIMER_RUNNING while a focus session is genuinely mid-countdown — a
  running row whose end moment is still ahead. A stale paused row from a
  closed tab does not block it. Deleting a preset removes only the stored
  preset, never the saved preferences or a timer in progress.

The tab edits the same `user_preferences` row the dashboard reads on load,
so the next visit to `/timer` picks the new rhythm up.
