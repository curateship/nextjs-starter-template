# The timer

The main screen, at `/` and `/timer`. A 300px SVG ring counts a focus or
break down, orange at rest and green while running, shrinking to fit a window
narrower than that — matched to the old
dashboard side by side: muted mono digits and the dark Start pill inside
the ring, which floats over the hero image; the mode tabs, which are the
shared segmented control; the thin goal bar with its mono label; and the rounded Tasks card on the plain canvas
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

## Using it by keyboard

**Space starts and pauses the timer**, on the dashboard and in zen mode. It
calls the same `toggleTimer` the Start pill calls, so on a break it pauses and
resumes the break, like the break's own play button. A line under the ring
says "Space to start" or "Space to pause", and only on a screen with a mouse or
trackpad (`pointer-fine`), since a phone has no Space bar to press.

Space leaves the timer alone whenever something else wants the key
(`src/lib/pomodoro/use-space-toggle.ts`):

- **Typing.** In a box, a text area, a select or anything editable, Space types
  a space. A task called "Write the intro" never touches the timer.
- **A focused button, link, switch or tab.** That control presses itself on
  Space, and the timer does not press as well.
- **An open dialog or popover**, such as the "Discard this focus?" question.
- **Held down or with Ctrl, Cmd or Alt.** Only a single plain press counts.

Every stop on this screen shows where it is. The dashboard's buttons are the
shared `Button`, so they draw the one focus ring the rest of the app draws
(`src/lib/layout/focus-ring.ts`); before this they were bare `<button>`
elements with hover styles only, and zen mode was the only part of the timer
you could see your way around.

- **The mode strip takes one Tab stop, not three.** Left and right move
  between Focus, Short break and Long break. It is `ui/tabs.tsx`, so the
  roving focus comes with the component rather than being written here.
  Measured: one Tab reaches it, ArrowRight moves Focus to Short break and
  ArrowLeft moves it back.
- **Tab order runs down the screen** from the ring's Start, Reset and Zen
  mode (plus the break's own play button on a break), through the mode strip, to the tasks card and the "Add a task" field
  at the bottom.
- **A control that is switched off is still reachable.** A disabled button
  cannot take focus, so the reason sits on a wrapper that can
  (`ui/disabled-reason.tsx`). Tab on to a greyed-out task row and the reason
  appears, the same sentence the mouse gets on hover.

## Controls that have gone dead say why

A faded button with no explanation is the commonest reason someone decides an
app is broken, so every control the timer switches off names the thing that
would switch it back on. The sentences are written as the action, not the
state — "Pause or finish the focus to choose a different task", never "Timer
is running" — and they live together in
`src/lib/pomodoro/disabled-reasons.ts`, because the same rule greys controls
out on three screens and three copies of one sentence drift apart.

- **Picking a task** is off while a focus is counting down: "Pause or finish
  the focus to choose a different task." A finished task reads "Reopen this
  task to focus on it again."
- **The header's minute steppers and preset rows** are off for the same
  reason: "Reset or finish the timer to change durations or presets." That
  sentence used to sit in a loose paragraph at the bottom of the popover with
  nothing tying it to the rows it was about. The paragraph is gone. What is
  left in its place is "Current values are custom", which is a fact about the
  numbers rather than a reason a control is off.
- **The daily goal's + and − at the end of the range** say "The goal can be
  between 1 and 20 sessions." on hover and on keyboard focus. The numbers come
  from `DAILY_GOAL_MIN` and `DAILY_GOAL_MAX`, so the sentence cannot drift from
  the limits. The buttons used to stop at 1 and 20 without a word.
- **The session note's Save is never off for want of a change.** Pressing it
  with nothing typed says "Saved" instead of doing nothing, because "nothing
  has changed" is not worth greying a button out for.

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
  (default 4, 1-20, saved per user). It is the shared `Meter`, so a screen
  reader hears "Today's daily goal, 3 of 4 sessions". Its label says "0 of 4 sessions
  completed today", naming what was counted, with "Goal reached" once passed, and
  under it the streak line: consecutive days with at least one finished
  focus, current and best. The day math runs in JS on yyyy-mm-dd strings in
  the user's own timezone (`calculateFocusStreaks`, unit-tested in
  `src/server/pomodoro/productivity.test.ts`); yesterday's streak stays
  current until today ends without a focus.
- **Reaching the goal is noticeable.** Once today's count meets the goal the
  bar's fill turns to the success colour (`--p-success`) and "Goal reached"
  turns from grey to bold, and a screen reader hears ", goal reached". The
  words stay the text colour rather than green, because the light theme's
  green is under 4.5:1 on white at that size. The focus that crosses the line
  also puts up one toast, "Daily goal reached: 8 sessions today."
  (`src/lib/pomodoro/goal-toast.ts`). Only a finished focus can raise it, so
  a reload, another visit that day, or lowering the goal under today's count
  stays quiet. No confetti and no extra sound, and the toast does not slide
  for anyone who asked their system for less movement.
- **When a focus finishes, a one-line note field appears** under the mode
  tabs, for what that session was for. It never takes keyboard focus and
  never touches the countdown, so a running break keeps running while it is on
  screen. See [Session notes](session-notes.md).

## Skipping a break

On a short or long break the wide pill inside the ring reads **Skip break**
instead of Start or Pause, and pressing it goes straight to the next focus.
Tyler asked for it on 1 October 2026: "There is no option to skip breaks at the
moment. Replace Start with Skip break if its on break."

- **The break is thrown away, not finished.** No chime, and nothing is written
  to `focus_sessions`: a break that was already running is cancelled the same
  way Reset cancels one. Only a focus is ever counted, so there is nothing to
  lose by leaving a break early, and the app does not ask first.
- **Where the cycle lands is the same as sitting through it.** Skipping a short
  break keeps the focuses already counted towards the long break, and skipping
  a long break ends the cycle and starts counting again from one. The rule is
  the same `advanceCycle` a finished break uses, so the "Session 2 of 4 before
  the long break" line reads the same either way. `skipBreak` in
  `src/lib/pomodoro/use-pomodoro.ts`.
- **Auto-start decides whether the focus is already running.** With the switch
  on, skipping drops you into a focus that is counting down; with it off, the
  focus sits at its full length waiting for Start, which is what happens when a
  break runs out on its own.
- **The break's own Start and Pause moved to a round icon**, between Reset and
  Zen mode inside the ring, and into the header's Timer popover beside Reset.
  It is drawn on breaks only, so the focus screen still has its two buttons.
  Without it there would be no way to run a break at all with auto-start off.
- **Zen mode is unchanged.** Tapping its ring still starts and pauses, because
  the ring is one big target and a stray tap there should not end the break.
  Leave zen mode to skip.

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

## When the app reads your data

Opening a member screen fetches your tasks, preferences and today's summary
once. Two things ask for it on every screen — the header's quick controls and
the page underneath them — and the store in `src/lib/pomodoro/use-pomodoro.ts`
answers both from one request.

- **A load already in flight is never duplicated.** The second asker gets the
  one that is running.
- **A load that finished less than five seconds ago is skipped**
  (`RELOAD_FRESH_MS`). Five seconds covers one navigation, and it is short
  enough that a change made in another tab is back before you have finished
  switching to this one. Measured on the dev server: moving between the timer
  and the tasks page fires one `loadProductivity` request when the last one is
  older than that and none when it is not.
- **A save never waits on that window.** Every explicit reload — a saved
  setting, a rejected reorder, the guest import — asks for fresh rows and
  always gets them. Only the refresh a screen does on mount is allowed to skip.
- **A failed load does not count as fresh**, so the next screen retries at
  once instead of sitting on the failure for five seconds.
- **The timer's own writes never go near this.** They go straight into the
  store, so the countdown and today's count are current whatever the window
  says.
- **A guest never fetches at all.** Those rows come out of the browser's own
  storage.

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
