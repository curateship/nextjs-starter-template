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
- **Rename** with the settings button on a row, which turns the row into a
  field. Every task already in the project follows the new name.
- **Archive** with the archive button. Archived projects move to an Archived
  group at the bottom of the card, each with one button to bring it back.
- **Two live projects may not share a name**, ignoring case, and the attempt
  says so ("You already have a project called …"). An archived project is
  excluded from that check, so a name can be used again later.
- **Guests have no projects.** The card is not drawn and the picker in the
  task row is shut with the reason, because a project is saved with the focus
  history and a guest has none on the server.

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
