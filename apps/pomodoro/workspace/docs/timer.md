# The timer

The main screen, at `/` and `/timer`. A 300px SVG ring counts a focus or
break down, orange at rest and green while running — matched to the old
dashboard side by side: muted mono digits and the dark Start pill inside
the ring, which floats over the hero image; the pill mode tabs with the
orange active chip; the FOCUS TASK pill; the centred hint; the thin goal
bar with its mono label; and the rounded Tasks card on the plain canvas
below (its own row style with the circle complete button and the inset
orange selection bar).

## How it behaves

- **Three modes** — Focus, Short break and Long break — as segmented tabs.
  Lengths come from the saved preferences (defaults 25/5/15 minutes).
- **The cycle:** every finished focus leads to a short break; the 4th finished
  focus leads to the long break; every break leads back to focus. The rule is
  `advanceCycle` in `src/lib/pomodoro/use-pomodoro.ts`, unit-tested next to it.
- **Auto-start** (the switch under the goal bar) moves to the next phase on
  its own and opens the next server session itself.
- **The countdown runs in the browser** on a 250ms tick against a wall-clock
  end moment, so a throttled background tab still shows the right time
  (`src/lib/pomodoro/timer.ts`).
- **The goal bar** shows finished focus sessions today against the daily goal
  (default 4, 1-20, saved per user), with "Goal reached" once passed, and
  under it the streak line: consecutive days with at least one finished
  focus, current and best. The day math runs in JS on yyyy-mm-dd strings in
  the user's own timezone (`calculateFocusStreaks`, unit-tested in
  `src/server/pomodoro/productivity.test.ts`); yesterday's streak stays
  current until today ends without a focus.

## What the server records

Every run writes one `focus_sessions` row through guarded endpoints in
`src/lib/api/pomodoro/productivity.ts` (start, pause, resume, cancel,
complete — reads `userGet`, changes `userPost`). A finished focus also adds
to that day's `daily_focus_stats` row, which goals, streaks and history read.
Tables live in `src/server/pomodoro/schema.ts`, created by migration
`0082_pomodoro_timer.sql`; a start carries an idempotency key so a retried
request cannot write two rows.

"Today" is the user's own calendar day: the browser sends its timezone and
the server derives the date (`localDateFor`), because the shell keeps no
timezone on the account. An unknown timezone falls back to UTC.

## Two lessons baked into the code

- **No server calls inside a React state updater.** The old app made them
  there; StrictMode runs updaters twice in development, and one press of
  Start wrote two session rows. Handlers read state through a ref instead.
- The task picker, the tasks card and the room preview from the old
  dashboard join with their own tasks (03 tasks page, 16 rooms).
