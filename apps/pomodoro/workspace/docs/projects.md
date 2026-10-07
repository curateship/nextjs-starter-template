# Projects

A project groups tasks at the level people bill and think at. Per-task time
answers "what did I do this afternoon"; a project answers "where did the month
go", which is the question worth a report.

A task holds at most one project, picked in the task's own editor on `/tasks`
beside the priority and the repeat. The project's name then shows after the
task's title in the list, in the same small muted capitals the priority marker
uses.

## Making and managing them

The Projects card sits under Today on `/tasks`, and holds every project the
person owns.

- **Create** with the "Add a project, press Enter…" field. A name is up to 60
  characters.
- **Edit** with the settings button on a row. It opens a small window under
  the button with the Name and the Target hours, then Cancel and "Save
  changes". The row stays as it is. Tyler asked for the window on 7 Oct 2026,
  the same one a task's settings button opens (`settings-window.tsx`). Every
  task already in the project follows a new name.
- **Archive** with the archive button. Archived projects move to an Archived
  group at the bottom of the card, each with one button to bring it back.
- **Two live projects may not share a name**, ignoring case, and the attempt
  says so ("You already have a project called …"). An archived project is
  excluded from that check, so a name can be used again later.
- **The new-project box keeps your text until the server says yes.** A name
  that is taken, or blank, stays in the box, the box is marked with
  `aria-invalid`, and the reason sits in red directly under it. It used to
  clear the box at once and put the reason at the very top of the Tasks page.
  Any other failure raises the error toast and still keeps the text. Typing
  again clears the reason.
- **Saving an edit waits for the server.** The window stays open with its
  spinner until the name and target have landed. A refusal, such as a name
  already taken, raises the error toast and leaves the window open with what
  you typed. Cancel, Escape or a click outside close it without saving.
- **Guests have no projects.** The card is not drawn and the picker in the
  task row is shut with the reason, because a project is saved with the focus
  history and a guest has none on the server.

## A target in hours

A project may aim at a number of hours each week or each month. The settings
window has a Target hours box under the name: type 10, pick "a week", save. A bar then
sits under the project's row reading "4h of 10h this week". Leave the box
blank and the project has no target, and looks exactly as it did before
targets existed.

- **The week is Monday to Sunday and the month is the calendar month**, in
  your profile's timezone, the same week History uses.
- **Only finished focus counts**, reached through the task's project, the
  same rule as History's project split. Breaks and cancelled timers never do.
- **Unused hours do not carry over.** Each week or month starts from zero.
- **Past the target the bar stays full** and the words carry the rest, so
  12h of 10h reads as 12h.
- **Whole hours from 1 to 744** (the hours in a 31-day month). The period
  is greyed out until there are hours to go with it.
- **The database refuses half a target.** `target_hours` and `target_period`
  are both null or both set, enforced by a check constraint
  (`pomodoro_projects_target_check`, migration
  `0117_pomodoro_tasks_and_planning.sql`), not only by the form.
- **An archived project's target is not shown**, because it is not on the
  card's live list.
- **Money, rates and invoices are not part of it.**

The sum is `loadProjectTargetProgress` in `src/server/pomodoro/projects.ts`:
one read covering both the week and the month, split with a SQL filter. The
bar is `TargetBar` in `src/components/pomodoro/projects-card.tsx`. History
shows the same figure under the project's row; see [Focus history](history.md).

## What archiving does and does not do

Archiving takes a project out of the task row's picker. It changes no task: a
task already in that project keeps it, and every hour the project earned stays
in History. That is the whole point of archiving rather than deleting — a
finished client should leave the picker and stay in the report.

Bringing a project back can fail when a new project has taken its name in the
meantime. The app says so rather than quietly renaming either one.

## On the rollover

A project rides along on the rollover the way priority does: the copy the
morning makes lands in the same project as yesterday's task. A repeat rule
keeps its own copy of the project too, so a repeating task arrives in the
right project even when yesterday's copy was finished and there is nothing to
carry. Both are covered in [Tasks](tasks.md).

## The split in History

`/history` draws a "By project" card beside "Top tasks", on the same four
ranges as the rest of the report and with the same bars. It is the same
completed focus sessions, grouped one level up, showing the eight biggest
projects — the same cap "Top tasks" uses, so no request scans unbounded
history.

- **A session reaches a project through its task.** A session on a task in no
  project, and a session on no task at all, share one "No project" row rather
  than being dropped. Nothing is silently left out of the grouping, so with
  eight projects or fewer the bars add up to the total printed at the top of
  the page.
- **An archived project still answers here.** Leaving the picker never erases
  its hours.
- **The grouping reads the task's project as it is now.** Moving a task to
  another project moves its past hours with it. There is no record of which
  project a task was in on the day, and nothing needs one.
- **Breaks and cancelled timers never count**, the same rule as the rest of
  the report.

## A project can be published, one at a time

The globe button on each project row decides whether that project's name and
its hours may appear on its owner's [public profile](public-profile.md). The
lock icon means private, which is what every project is.

- **Every project is private, and only a press changes that.** That covers
  every project that already existed and every one made from now on. No
  migration ever turns one on.
- **It is per project, never a single switch for all of them.** A project name
  is often a client's name, and publishing one by accident is the kind of
  mistake that loses somebody work.
- **Unticking takes it off the page on the next load.** Nothing is deleted;
  the profile simply stops reading it.
- **The profile shows the last seven days only**, by project, and only
  projects that are both ticked and have finished focus in that week. Task
  titles and session notes never appear there.

## Where things live

- Rows: `pomodoro_projects`, migration `0094_pomodoro_projects.sql`, which
  also adds `tasks.project_id` and `pomodoro_task_repeats.project_id`. Both
  are `on delete set null`, so a removed project never takes a task or its
  finished sessions with it.
- Server logic: `src/server/pomodoro/projects.ts`. Every query is keyed on the
  signed-in user's id as well as the row id, so a project id from the browser
  can only ever reach that person's own rows.
- Endpoints: `src/lib/api/pomodoro/projects.ts`, all guarded — reads with
  `userGet`, changes with `userPost`.
- The History query is `loadFocusReport` in
  `src/server/pomodoro/focus-report.ts`; the card is `TopProjectsCard` in
  `src/components/pomodoro/history-page.tsx`.
- The card on `/tasks` is `src/components/pomodoro/projects-card.tsx`.
- The published tick is `pomodoro_projects.is_public`, added by migration
  `0101_pomodoro_public_profile.sql` with a default of false, and read by
  `src/server/pomodoro/public-profile.ts`.
