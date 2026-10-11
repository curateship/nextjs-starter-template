# Labels and sections

Two ways to sort a project's work beyond its four statuses. They look alike
and do different jobs:

- **Labels belong to the team** and cut across projects. "Bug", "Client" or
  "Waiting on supplier" mean the same thing in every project, and the Label
  filter finds them anywhere.
- **Sections belong to one project.** They are its own headings, such as
  "Design" and "Build", and the List tab groups rows under them.

Use a label when the same kind of work turns up in several projects. Use a
section to split one big project into stages.

## Labels

- **Anyone on the team can make one**, from a task's Labels field (New label),
  with a name of up to 40 characters and one of the project colours. Names are
  unique in a team whatever their capitals, so "bug" and "Bug" can't both
  exist. A team can have up to 100.
- **A task holds any number**, picked from the team's labels. Anyone who can
  change the task can change its labels.
- **They show** on Board cards and List rows as the colour dot and the name,
  never the colour alone.
- **Owners and admins rename, recolour and delete them**, in Team settings
  (the cog on the Team dashboard). Everyone else sees the list there.
- **Deleting one takes it off every task** that had it, in every project.
- **The Label filter** sits beside search, Status and Person on a project's
  Board and List tabs and on My dashboard.

## Sections

- **Anyone who can change the project** adds, renames and deletes its
  sections, in Project settings (the cog on the project page). A project can
  have up to 30.
- **A task picks its section** in the task itself, from the Section field.
- **The List tab groups rows under them**, in the order they were added, with
  "No section" last. An empty section still shows its heading, unless a search
  or filter is on.
- **The Board shows the section's name** on each card.
- **Renaming one renames it everywhere**, since every task points at the one
  section.
- **Deleting one moves its tasks to "No section".** The tasks stay.

## The project's own order

Tyler chose one order for the whole project on 10 Oct 2026, so the order
tells everyone what comes first.

- **Drag a card up or down in its Board column**, or a row by its handle on the
  List tab inside its section, and everyone on the project sees the new order
  after a reload.
- **Dragging a card to another column changes its status** and puts it where it
  was let go in that column. While it is held, a copy follows the pointer and
  the column it is over makes room for it, so it never shows back in its old
  column. Dropped on Stuck, it waits for the reason, and goes back if the
  reason window is closed.
- **New tasks go last.**
- **Only the dragged tasks move.** They swap among the places they already
  held (`placesAfterReorder` in `src/lib/project/task-order.ts`), so
  reordering one column or one section never shuffles the rest.
- **Sorting the List by a column** stops the dragging, and "Use the project's
  order" puts it back.
- **No keyboard dragging.** Enter on a card opens it. The order can only be set
  with a mouse or a finger.

## Where it lives

- **Tables:** `drizzle/0099_project_finding_and_sorting.sql`: `project_labels`,
  `project_task_labels`, `project_sections`, and `project_tasks.section_id` and
  `position`.
- **Rules:** `src/server/project/labels.ts` and `src/server/project/sections.ts`
  (which also holds the order).
- **Endpoints:** `src/lib/api/project/sorting.ts`.
- **Screens:** `src/components/project/task-sorting-fields.tsx` (a task's
  Section and Labels), `project-sections-card.tsx` (Project settings) and
  `team-labels-card.tsx` (Team settings).
