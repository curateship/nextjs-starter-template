# The timer

The main screen, at `/` and `/timer`. A 300px SVG ring counts a focus or
break down, orange at rest and green while running, shrinking to fit a window
narrower than that — matched to the old
dashboard side by side: muted mono digits and the dark Start pill inside
the ring, which floats over the hero image; the pill mode tabs with the
orange active chip; the thin goal bar with its mono label; and the rounded Tasks card on the plain canvas
below (its own row style with the circle complete button and the inset
orange selection bar).

## The ring on a narrow window

The ring is 300px wide at most and the width of the page at least, whichever is
smaller, so it stays a whole circle on a phone instead of running off the side.
A 375px window gives it the full 300px; a 320px window gives it 272px.

The cap is a percentage of the content column, not of the window, so the ring
follows the page's left and right edge without repeating that number. The SVG
inside it keeps its `viewBox` of 300 units, so every coordinate and the stroke
width are still written at the size they were drawn for and only the drawn
result scales.

Zen mode sizes its own ring against the window instead
(`min(380px, 100vw - 48px, 100vh - 260px)`), which is the right measure there
because zen mode covers the window and must not be scrolled.

## What is not on it

Tyler had the FOCUS TASK pill and the line of encouragement under it
removed on 27 September 2026. The dashboard no longer names the task the
focus is on, and there is no "Choose a task" link on it. The task is
chosen in the Tasks card below and on `/tasks`: tapping a task chooses it
and tapping the chosen one again clears it, which is what the pill's cross
used to do. Zen mode still shows the name.

## How it behaves

- **Three modes** — Focus, Short break and Long break — as segmented tabs.
  Lengths come from the saved preferences (defaults 25/5/15 minutes).
- **The orange chip slides** from one tab to the next over 300ms instead of
  blinking out and in. The chip is one layer behind the labels, and its
  position and width are measured from the live buttons
  (`ModeTabs` in `src/components/pomodoro/timer-dashboard.tsx`), because the
  three labels are different widths and the font arrives after the first
  paint. A ResizeObserver re-measures when the row reflows, and the chip is
  not drawn at all until it has been placed, so it never slides in from the
  left edge on load. Anyone who has asked their machine for less movement
  gets the jump.
- **The cycle:** every finished focus leads to a short break, the focus that
  reaches the rhythm's number leads to the long break, and every break leads
  back to focus. The number is part of the saved rhythm, 4 in the classic
  pattern and 2 to 8 in general; see
  [Sessions before the long break](sessions-before-long-break.md). The rule is
  `advanceCycle` in `src/lib/pomodoro/use-pomodoro.ts`, unit-tested next to it.
- **A mono line under the goal bar says where the cycle is:** "Session 2 of 4
  before the long break" while focusing, and "Next: session 3 of 4 before the
  long break" on a break, because the focus you were in is over
  (`cycleSessionLabel` in `src/lib/pomodoro/timer.ts`).
- **Switching phase and pressing Reset ask first when a focus is in
  progress.** Nothing is recorded for a focus that does not finish, and both
  controls are one stray tap away, so the app asks before nineteen minutes go
  in the bin. The question names the minutes already spent and what happens
  next: "19 minutes of this focus is lost and the timer switches to Short
  break." Cancel is worded "Keep focusing" and leaves the countdown running,
  untouched.
- **It only asks when there is something to lose.** A break of any kind, and a
  focus nobody has started, change straight away with no dialog. A focus that
  is paused partway through still asks, because the time spent is just as gone.
  The rule is `focusWouldBeLost` in `src/lib/pomodoro/timer.ts`, unit-tested
  beside it, and all three controls share one hook,
  `src/components/pomodoro/discard-focus-confirm.tsx`: the mode pills, Reset on
  the dashboard, and Reset in the header's Timer popover. The minutes are
  frozen when the question is asked so the sentence does not climb while it is
  being read.
- **Auto-start the next timer** (the switch under the goal bar) starts
  whatever comes next, a break or a focus, on its own, and opens the next
  server session itself. It is worded that way on the dashboard, in
  Settings → Timer and in the preset editor because it is not only focuses
  that it starts. Tyler, 27 September 2026: "Auto start next phase is
  wrong".
- **The countdown runs in the browser** on a 250ms tick against a wall-clock
  end moment, so a throttled background tab still shows the right time
  (`src/lib/pomodoro/timer.ts`).
- **The pencil beside the goal bar edits the goal**, as a stepper in a
  popover: one tap a session, 1 to 20, saved the moment it moves. It never
  touches the countdown, so it works while the timer runs, and Settings >
  Timer edits the same number. `setDailyGoal` in
  `src/lib/pomodoro/use-pomodoro.ts` is the one saver for both.
- **The goal bar** shows finished focus sessions today against the daily goal
  (default 4, 1-20, saved per user). Its label says "0 of 4 sessions
  completed today", naming what was counted, with "Goal reached" once passed, and
  under it the streak line: consecutive days with at least one finished
  focus, current and best. The day math runs in JS on yyyy-mm-dd strings in
  the user's own timezone (`calculateFocusStreaks`, unit-tested in
  `src/server/pomodoro/productivity.test.ts`); yesterday's streak stays
  current until today ends without a focus.
- **When a focus finishes, a one-line note field appears** under the mode
  tabs, for what that session was for. It never takes keyboard focus and
  never touches the countdown, so a running break keeps running while it is on
  screen. See [Session notes](session-notes.md).

## When a save fails

- **One red line, and it leaves when the problem does.** A failed save writes a
  sentence into `syncError` (`src/lib/pomodoro/use-pomodoro.ts`) and the timer
  and the tasks page each show it above the content. Every request that settles
  successfully clears it, so a save that works takes the warning down with no
  reload. Before that, one dropped request pinned the line up for the rest of
  the evening, which teaches people to ignore warnings.
- **Both screens word it the same.** Both use `InlineError` from
  `src/components/ui/inline-error.tsx`, so one failure never reads as a warning
  on one screen and an error on the other.
- **A failed tick or removal is a toast, not this line.** Those two belong to a
  single row rather than the whole screen; see [Tasks](tasks.md).
- **A failed load never claims the list is empty.** After a load that failed,
  an empty list means "we do not know", so `loadFailed` on the engine's state
  holds the empty state back and the warning line does the talking.
- **While the tasks are loading the screen says so** instead of claiming you
  have none. "Loading your tasks…" stands in the Tasks card until the list
  lands (`loading` on the engine's state, true until the first load settles
  either way).

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
