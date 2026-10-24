# Tags and groups

Tags are how a task is sorted beyond its status, and the Group row in Filter
is how the List and Timeline put tasks under headings. Both replaced the
project's sections on 19 Oct 2026 (Tyler: "remove the section and replace
with multiselect tags", and "In the filter dropdown, add a new row called
'Group' like notion"). Tags were called labels until then; the code and the
database still say label (`project_labels`, `labelIds`).

- **Tags belong to the team** and cut across projects. "Bug", "Client" or
  "Waiting on supplier" mean the same thing in every project, and the Tags
  filter finds them anywhere. A task holds any number.
- **Milestones belong to one project**, and say when a set of tasks must be
  finished, such as "Design signed off, Nov 15". A tag says what a task is;
  a milestone says when it must be done by. See
  [Milestones](projects-and-tasks.md#milestones).

Use priority, not a tag, for what to pick first: High, Normal or Low is on
every task and sorts and filters on its own (see
[Projects and tasks](projects-and-tasks.md#tasks)). Use a
[task type](task-types.md) when a kind of work needs its own fields, such as
a footage link and a final cut file. A tag can't hold a link, a file or a
number.

## Tags

- **On the task, right under its title**, in the right panel: the task's
  tags as pills to read, and nothing while it has none. They are changed in
  Add tags, in the three-dot button at the top of the panel (Tyler, 20 Oct
  2026: "Move the add tags into the vertical menu dropdown too"): the tags as
  pills, each with an × that takes it off, then a box. Typing a name
  and pressing Enter puts that tag on the task. If the team has no tag of
  that name yet, it is made first, grey. Backspace in the empty box takes the
  last tag off; Escape empties the box. While typing, the team's tags that
  match show under the box to click. Tyler asked for this on 19 Oct 2026: "I
  should be able to enter to place a tag and it should show a pill with an x
  icon to remove it", after finding the old Labels field hidden in a card
  under the task's cog. The full task window has the same box, under "Tags".
- **Names** are up to 40 characters and unique in a team whatever their
  capitals, so typing "bug" puts on "Bug". A team can have up to 100.
- **Anyone who can change the task can change its tags**, and anyone on the
  team can make a new tag that way.
- **They show** on Board cards, List rows and My dashboard as a small dot
  and the name, never the colour alone, and really faint: no edge, pale grey
  words and a half-strength dot, so they never compete with the task's name
  (Tyler, 19 Oct 2026: "the tags are too visible, make it really faint"). The
  pills in a Tags box stay at full strength, since that is where they are
  changed.
- **The site admin renames, recolours and deletes them**, in Team settings'
  Tags card (Teams, then the team's cog). Everyone else sees the list there.
- **Deleting one takes it off every task** that had it, in every project.
- **The Tags filter** sits in Filter with Status, Priority, Due and Type, on a
  project's tabs and on My dashboard.

## Group

- **Filter's Group row** puts the List's rows and the Timeline's bars under
  headings: None, Status, Priority, Tags, Due date, Assigned to or Type. Only
  headings with tasks under them show, each with its count on the List. A
  heading row is a much lighter grey than the table's own header, with a
  divider line above and below it, so the two never read as one band (Tyler,
  19 Oct 2026). Every heading is the same height. It is the shell's
  `TableGroupRow` (see the repo's `docs/shell/user-interface.md`).
- **Due date** groups are Overdue, Today, This week (today and the six days
  after), Later, Earlier (Done tasks whose day has passed) and No due date,
  on the reader's own clock, the same as the red due dates.
- **Tags** lists each tag by name, then No tags. A task with two tags shows
  under both, and its row drags from either.
- **Assigned to** lists each person by name, then Nobody; **Type** each type,
  then No type.
- **The choice is kept per project** in this browser (`project-task-grouping-<id>`),
  and Clear in Filter leaves it alone, since it arranges tasks rather than
  hiding any. It starts on None. A saved view keeps it too, and a group on
  its own is enough to save one (see Saved views in
  [Projects and tasks](projects-and-tasks.md)).
- **The Board keeps its status columns.** Its Group row offers None or
  Assigned to, which draws a row of columns per person: the old "Group by
  person" switch, moved into the row.
- **Each List heading has a "+"** while pointed at, which starts a new task
  in that group (see [Making tasks quickly](projects-and-tasks.md#making-tasks-quickly)).
- **The rule** is `groupTasks` in `src/lib/project/task-groups.ts`.

## Sections, before 19 Oct 2026

A project had its own headings, such as "Design" and "Build", set in Project
settings, and the List and Timeline grouped under them. Migration 0123 made
each task's section a tag of the same name (cut to 40 characters, grey, made
once per team), and did the same inside saved templates. `project_sections`
and `project_tasks.section_id` stay in the database as history and nothing
reads them.

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
  - **Priority** and **Type:** that one. No type takes the type off.
  - **Assigned to:** asks "Hand this task to Sam?" first, as the Board does;
    Nobody asks "Take everyone off this task?".
  - **Due date:** Today is due today, This week tomorrow, Later eight days on,
    and No due date clears it. Overdue and Earlier take no drops.
  - **Tags:** the tag it was under is swapped for the new one, and its other
    tags stay. A heading it is already under takes no drop, and No tags only
    takes a task whose one tag it leaves.
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

- **Tables:** `project_labels` and `project_task_labels`
  (`drizzle/0099_project_finding_and_sorting.sql`), and `project_tasks.position`.
- **Rules:** `src/server/project/labels.ts` (tags) and
  `src/server/project/task-order.ts` (the order).
- **Endpoints:** `src/lib/api/project/sorting.ts`.
- **Screens:** `src/components/project/task-tags-field.tsx` (a task's Tags
  box), `team-labels-card.tsx` (Team settings' Tags card) and
  `task-filter-popover.tsx` (the Tags filter and Group row).
