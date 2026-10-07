# Tasks

Today's plan and the six days after it, at `/tasks`, and today's plan in the
Tasks card on `/timer`. A task has a title, a Low/Normal/High priority, an
optional estimate of 1 to 20 sessions, a done count shown as
`done/estimate pomos`, an optional repeat rule, an optional project
([Projects](projects.md)), up to ten steps and up to three tags.

## How it behaves

- **Create** with the "Add a task, press Enter…" field.
- **Edit from the settings button** on a row. It opens a small window under
  the button, and the list stays where it is. The window holds labelled
  fields for title, priority, estimate, repeat, project and tags, and ends
  in Cancel and "Save changes". Tyler asked for this on 7 Oct 2026 in place
  of the row turning into fields (`TaskSettingsWindow` in
  `today-task-list.tsx`). The window keeps 16px from the edge of the screen
  on a phone.
- **Closing the window drops what was typed.** Cancel, Escape or a click
  outside close it without saving, and the keyboard lands back on the
  settings button. Picking from a dropdown inside it does not close it.
- **What you typed is never thrown away.** Enter on an empty or all-spaces
  box sends nothing, keeps whatever was in the box, marks it with
  `aria-invalid` and raises the error toast saying a task needs words. The box
  clears only when a task was actually added. The same holds in the timer's
  task list and on the Tasks page (`addTask` returns false for a blank title).
- **The window stays open until its save has landed.** Save shows a
  spinner while the request is out, and a second press does nothing. On
  success the window closes. On a failure it stays open with your edits
  still in it, the error toast says what failed, and Save can be pressed
  again. A blank title is refused before anything is sent, the same way.
- **The repeat is checked too.** It is saved after the task, and if the repeat
  is refused the toast says "The task was saved, but its repeat could not be",
  and the window stays open so it can be picked again.
- **Reorder by drag** on the Tasks page and on the timer — mouse, touch or
  keyboard — with dnd-kit, announced to screen readers (`src/components/pomodoro/today-task-list.tsx`). The server
  only accepts an order that names today's full active list exactly once
  (`TASK_ORDER_MISMATCH` in `src/server/pomodoro/tasks.ts`); a refused order
  rolls back on screen and reloads the list.
- **Complete and reopen** with the row checkbox. Completing adds one to the
  day's `tasks_completed` stat, reopening takes it back. Completed tasks
  sit in their own group under a "Done today · 2" heading, struck through,
  with the same repeat, project and priority marks as an active row. A
  completed row has no edit button, because the server refuses edits to a
  finished task; reopen it first.
- **The timer and the Tasks page draw the same list.** Both use
  `TodayTaskList` and its one `TaskRow` in `today-task-list.tsx`, built from
  the shared Checkbox, Button and Input, and the same `NewTaskForm` add box.
  The two are the same down to the drag handle: Tyler asked for dragging on
  the timer page too on 7 Oct 2026, and before that the timer's rows had
  none. The timer used to keep its own copy with a tick drawn in CSS, bare
  buttons and a native input, and the two had drifted apart. A fix to one
  list is now a fix to both.
- **Remove** marks the row `abandoned`; it keeps its finished sessions.
- **The X asks before it removes.** A window titled "Remove this task?" says
  the task comes off the list and its finished focus stays in History, and
  for a repeating task that it still comes back on its next repeat day.
  Cancel, Escape or the window's own X keep the task. Tyler asked for this
  on 7 Oct 2026 (`RemoveTaskButton` in `today-task-list.tsx`, used on today's
  list, the timer card and days planned ahead).
- **A tick, and a removal once confirmed, land on the press, not on the
  answer.** The row moves straight away and the request goes afterwards, so
  three tasks ticked in a row keep up with how fast you press. A guest always
  worked this way; an account used to wait for the round trip, which made
  signing in feel slower than not bothering.
- **The server's answer is still the truth.** `togglePersistentTask` answers
  with the row's status and its done count, and both are written on top when
  they arrive, so a tick the server disagrees with is corrected rather than
  kept.
- **One press sends one request.** While a row's own request is in flight its
  checkbox and its X are switched off (`pendingTaskIds` in
  `src/lib/pomodoro/use-pomodoro.ts`), so a fast double press cannot send two.
- **A failed tick or removal puts that one row back** and says why in the
  shared error toast: "The task could not be updated." or "The task could not
  be removed." Only the row that failed moves, because another row's answer may
  have landed while this one was in the air. A removal that failed comes back
  where the ordering rules put it, and gets its selection back only if it still
  held it when it left.
- **While the list is loading it says so.** "Loading your tasks…" stands where
  "No active tasks." would, and the archive says "Loading past days…", because
  an empty state and a loading state mean opposite things and the empty one
  arrived first on every visit. The card keeps its own frame around the line so
  nothing jumps when the rows land. A guest is never loading: those tasks come
  out of the browser's own storage in the same breath as the page.
- **The focus task:** clicking a row's title picks it, only while the timer
  is fully idle. The next focus session carries its id, and completing that
  focus adds one to the task's count (`completeProductivitySession`).
- **A row you cannot pick says why.** While a focus is counting down the title
  button is off and reads "Pause or finish the focus to choose a different
  task". A finished row has no pick button at all, only its struck-through
  title. The sentence comes from `src/lib/pomodoro/disabled-reasons.ts`.

## Using the list by keyboard

- **The reason on a greyed-out row is reachable by Tab**, not only by mouse.
  A disabled button cannot take focus, so `ui/disabled-reason.tsx` puts the
  tooltip on a wrapper that can.
- **The drag handle is a 28px target with a visible focus ring.** It had no
  size or padding class at all, so it was a 16px icon to aim at and nothing
  showed when a keyboard landed on it — even though the keyboard reordering
  behind it already worked. Space or Enter picks a task up, the arrows move
  it, Space or Enter drops it, Escape cancels.
- **The repeat rule is part of the row's name, not a tooltip.** The old
  tooltip hung off a bare `<svg>`, which nothing can focus, so the rule was
  mouse-only; a focusable trigger inside the title button would not be valid
  HTML either. A screen reader now reads "Chapter three. Repeats Monday to
  Friday" as one name, and the small repeat icon stays as the visual cue.

## Planning the week ahead

A strip of seven day buttons sits above the list on `/tasks`: Today, then the
next six days by name ("Thu", "Fri" and so on). Pick Thursday and the card
shows Thursday's list, with its own "Add a task, press Enter…" box. A day
holding tasks shows how many on its button. Tyler picked seven days on
7 Oct 2026.

- **A task planned for Thursday is on Thursday and nowhere else.** It is not
  on today's list, the timer cannot pick it, and it cannot be ticked. On
  Thursday morning it is simply part of Thursday's list.
- **A day ahead can be edited, given steps and tags, and cleared.** The
  editor there has no repeat picker, because a repeat is made by the
  morning's rollover from the day's own copy. Drag-to-reorder is today's
  only.
- **The window is enforced by the server.** A tick on a task planned for a
  later day is refused, so it can never add to today's completed count. A
  create or an edit for a date in the past or more than six days ahead is
  refused
  (`PLANNED_DATE_OUT_OF_RANGE`, `isPlannableFutureDay` in
  `src/lib/pomodoro/plan-ahead.ts`), worked out against the account's own
  today, not the browser's.
- **Nothing planned ahead means nothing changes.** Today's screen, the timer
  and the rollover behave exactly as before.
- **The timer is today only.** Its focus-task picker reads today's list and
  the server refuses a focus on any other day's task.
- **Guests do not get the strip.** A guest's tasks live in the browser and
  there is no server today to plan from.

The future day is loaded on its own by `loadPlannedDay` and kept out of the
timer's store (`src/lib/pomodoro/use-planned-day.ts`); the counts on the strip
come with the day's load (`countPlannedDays` in
`src/server/pomodoro/tasks.ts`). The list is
`src/components/pomodoro/planned-day-list.tsx`.

## Steps inside a task

A task can carry a short checklist of up to ten steps, each a line of words
and a tick. The list button on a row opens them; once a task has steps the
button reads "3 of 5". It is a checklist, not a second task system: a step
has no estimate, date or focus count.

- **An X beside the "Add a step" box folds the steps away**, the same as
  pressing the row's steps button again. It lines up under the row's own X.
  Tyler asked for it on 7 Oct 2026.
- **Ticking the last step does not complete the task.** The task's own tick
  stays separate and manual.
- **An eleventh step is refused** by the server under a lock on the task row,
  so two quick presses cannot both get in (`TOO_MANY_STEPS`).
- **A finished task's steps are frozen.** They show as they were left, with
  nothing to press, and the server refuses changes to them.
- **On a phone the first step starts from the settings window.** The row
  has no room for an empty steps button, so until a task has a step the
  window shows an "Add steps" button that closes it and opens the steps.
- **Deleting a task deletes its steps**, through `on delete cascade`.
  Removing a task (the X) keeps both, as it always kept the row.
- **Guests have no steps.** They need a table on the server.

The steps table is `pomodoro_task_steps` (migration
`0117_pomodoro_tasks_and_planning.sql`), the server logic is
`src/server/pomodoro/task-steps.ts`, and the list is
`src/components/pomodoro/task-steps.tsx`.

## Tags

A task can carry up to three short labels, such as "admin", "email" or
"reading", that cut across projects. They are added in the task's editor:
type one and press Enter, or press one of the tags you used lately, which
appear as buttons while you type. Tyler set the cap at three on 7 Oct 2026.

- **Tags read as quiet labels**, small and grey after the title ("#admin"),
  and are left off the row on a phone, so they never compete with the title.
  A screen reader hears them as part of the row's name.
- **One spelling per tag.** Names are trimmed, spaces squeezed and lower
  cased (`normalizeTagName`), so "Admin " and "admin" are one tag, unique per
  account by a database index.
- **The picker offers the tags used in the last 30 days.** A tag nobody used
  for 30 days leaves the picker but is never deleted, so History can still
  filter by it, and typing it again brings it back.
- **The Tasks screen has a tag filter** beside the day strip. Picking
  "admin" shows only the tasks tagged admin on the day you are looking at.
  Dragging is off while a filter is on, because a drag must name every task.
- **History's sessions table filters by tag too**; see
  [Focus history](history.md).
- **The whole set is saved in one request**, after the task's own save, so a
  row never holds half an edit. If only the tags fail, the toast says "The
  task was saved, but its tags could not be" and the window stays open.
- **Guests have no tags.** The box in the editor is shut with the reason.

The tables are `pomodoro_tags` and the join `pomodoro_task_tags`; the logic is
`src/server/pomodoro/task-tags.ts`.

## Where things live

Rows live in the `tasks` table (`src/server/pomodoro/schema.ts`, migration
`0083_pomodoro_tasks.sql`, which also points `focus_sessions.task_id` at it —
a deleted task keeps its sessions through `on delete set null`). Endpoints
are in `src/lib/api/pomodoro/productivity.ts`, all guarded. Tasks belong to
one calendar day (`planned_date`).

## Rollover and archive

Opening the app copies every still-active task from an earlier day onto
today's list — priority, estimate, project, repeat rule, done count, steps,
tags and order intact — and marks each original as `carried`, linked to its
copy (`rollOverTasks` in `src/server/pomodoro/tasks.ts`, run by the load
itself; there is no scheduled job).

- **Steps come with their ticks.** A carried task is the same unfinished
  job, so 3 of 5 yesterday is 3 of 5 today. Tyler's call on 7 Oct 2026.
- **Tasks planned for today stay on top.** Only earlier days are read, so a
  task planned ahead for today is never copied twice. Yesterday's leftovers
  land under it. Tyler's call on 7 Oct 2026: carry the leftovers, below the
  plan, rather than skip them.
- **A repeat rule's copy starts with no steps** and wears the tags of the
  rule's last copy. The archive section under Today groups past days
newest first, up to 50 rows, with a badge per row: Completed (green), Carried
over (orange) or Abandoned (grey).

## Repeating a task

A task can come back every day, Monday to Friday, or on days you tick. The
repeat is set in the task's own editor, next to the project, and a repeating
task shows a small repeat icon after its title, and which days it repeats on
is read out as part of the row's name.

- **The rule is a row of its own**, `pomodoro_task_repeats` (migration
  `0093_pomodoro_task_repeats.sql`), not a column on the task. A task belongs
  to one calendar day and a rule outlives every day it makes.
- **The picked days are one seven-bit number**, bit 0 Sunday through bit 6
  Saturday, so "every day" is all seven bits rather than a separate kind and
  two fields can never disagree. `src/lib/pomodoro/task-repeats.ts` holds the
  arithmetic and is the only place that reads a weekday.
- **The rollover asks each rule for the day's copy**, after it has carried
  yesterday's unfinished tasks. That order is what stops one task arriving
  twice: a carried copy keeps the rule's id, so the rule finds it and adds
  nothing. A unique index on `(repeat_id, planned_date)` backs that up, for
  the case of two browser tabs loading the day at the same moment.
- **Completing today's copy never touches the rule.** Tomorrow's copy still
  arrives, with a done count of zero.
- **Ending the repeat deletes the rule row**, which stops future copies. The
  days it already made stay exactly where they are, through
  `on delete set null` on `tasks.repeat_id`.
- **Editing a repeating task edits the rule too.** Rename it and tomorrow's
  copy has the new name, because the rule keeps its own copy of the title,
  priority, estimate and project (`updateTaskPlan`).
- **Removing today's copy does not bring it back on reload.** The removed row
  still holds the rule's id for that day, so the unique index refuses a second
  one. The rule resumes tomorrow.
- **Guests cannot repeat a task.** The copy is made on the server each
  morning and a guest has no rollover, so the control is shut with that reason
  rather than hidden.
