# Groups and the project's order

The Group row in Filter is how the List and Timeline put tasks under
headings. It replaced the project's sections on 19 Oct 2026 (Tyler: "In the
filter dropdown, add a new row called 'Group' like notion").

Tags were removed on 6 Nov 2026 (Tyler: "remove the steps, timer and tags
feature"). Task templates and their fields were removed on 6 Nov 2026
(Tyler: "We need to remove the tasks templates feature too"), and Group by
Template with them. A task is sorted by its status, its priority and its
project's [milestones](projects-and-tasks.md#milestones). A saved view that
filtered or grouped by a tag or a template lost that part, and one left with
nothing else was deleted (`drizzle/0152_project_remove_tags.sql`,
`drizzle/0153_project_remove_task_templates.sql`).

## Group

- **Filter's Group row** puts the List's rows and the Timeline's bars under
  headings: None, Status, Priority, Due date or Assigned to. Only
  headings with tasks under them show, each with its count on the List. A
  heading row is a much lighter grey than the table's own header, with a
  divider line above and below it, so the two never read as one band (Tyler,
  19 Oct 2026). Every heading is the same height. It is the shell's
  `TableGroupRow` (see the repo's `docs/shell/user-interface.md`).
- **Due date** groups are Overdue, Today, Tomorrow (Tyler, 2 Nov 2026: "Add
  a tomorrow sort under today"), This week (the rest of the seven days from
  today), Later, Earlier (Done tasks whose day has passed) and No due date,
  on the reader's own clock, the same as the red due dates. Tomorrow's "+"
  starts a task due tomorrow, as Today's starts one due today.
- **Assigned to** lists each person by name, then Nobody.
- **The choice is kept per project** in this browser (`project-task-grouping-<id>`),
  and Clear in Filter leaves it alone, since it arranges tasks rather than
  hiding any. It starts on None, and so does a browser that last grouped by
  Tags or Template. A saved view keeps it too, and a group on
  its own is enough to save one (see Saved views in
  [Projects and tasks](projects-and-tasks.md)).
- **The Board keeps its status columns.** Its Group row offers None or
  Assigned to, which draws a row of columns per person: the old "Group by
  person" switch, moved into the row.
- **Each List heading has a "+"** while pointed at, which starts a new task
  in that group (see [Making tasks quickly](projects-and-tasks.md#making-tasks-quickly)).
- **Each List heading has an arrow** beside its "+" that folds the heading
  shut and opens it again; the count stays in view (Tyler, 24 Oct 2026:
  "beside the + icon, there should be a arrow collapse icon to collapse the
  section too"). This browser remembers the folds per project and per
  grouping, since a heading only means something in its own grouping ("the
  collapse doesnt remember"). With Mass select on, the tick box that selects
  all takes only the tasks in view, never those under a folded heading. The
  buttons are in
  `src/components/project/task-list-heading.tsx`, the state in
  `src/lib/project/use-folded-headings.ts`.
- **The rule** is `groupTasks` in `src/lib/project/task-groups.ts`.

## Sections, before 19 Oct 2026

A project had its own headings, such as "Design" and "Build", set in Project
settings, and the List and Timeline grouped under them. Migration 0123 made
each task's section a tag of the same name, and those tags went with every
other tag on 6 Nov 2026. `project_sections` and `project_tasks.section_id`
stay in the database as history and nothing reads them.

## The project's own order

Tyler chose one order for the whole project on 10 Oct 2026, so the order
tells everyone what comes first.

- **Drag a card up or down in its Board column**, or a row by its handle on the
  List tab inside its heading, and everyone on the project sees the new order
  after a reload. The List's handles show once **Mass select** is pressed.
- **Dragging a List row under another heading changes what it is grouped by**
  (Tyler, 24 Oct 2026), and puts it where it was let go there. While it is
  held, a copy follows the pointer and the rows slide apart to make room. Each
  change is the same save as the task's own picker:
  - **Status:** that status. Dropped on Stuck, it waits for the reason.
  - **Priority:** that one.
  - **Assigned to:** asks "Hand this task to Sam?" first, as the Board does;
    Nobody asks "Take everyone off this task?".
  - **Due date:** Today is due today, Tomorrow tomorrow, This week the day
    after tomorrow, Later eight days on, and No due date clears it. Overdue and Earlier take no drops.
- **Dragging a card to another column changes its status** and puts it where it
  was let go in that column. While it is held, a copy follows the pointer and
  the column it is over makes room for it, so it never shows back in its old
  column. Dropped on Stuck, it waits for the reason, and goes back if the
  reason window is closed.
- **New tasks go last.**
- **Only the dragged tasks move.** They swap among the places they already
  held (`placesAfterReorder` in `src/lib/project/task-order.ts`), so
  reordering one column or one group never shuffles the rest.
- **Sorting the List by a column** stops the dragging, and "Use the project's
  order" puts it back.
- **No keyboard dragging.** Enter on a card opens it. The order can only be set
  with a mouse or a finger.

## Where it lives

- **Table:** `project_tasks.position`.
- **Rules:** `src/lib/project/task-groups.ts` (the groups) and
  `src/server/project/task-order.ts` (the order).
- **Endpoints:** `src/lib/api/project/sorting.ts`.
- **Screens:** `src/components/project/task-filter-popover.tsx` (the Group
  row).
