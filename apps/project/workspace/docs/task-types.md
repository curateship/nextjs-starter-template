# Task types

A team makes its own kinds of task, such as "Research" or "Video editing",
and each kind asks for its own fields. A Research task asks for a question and
sources. A Video editing task asks for footage, a platform and the final cut.
Tyler asked for this on 11 Oct 2026: "This feature allows me to customize each
task type with its own fields and logic." His rules are in
[What this app is](what-this-app-is.md), which wins wherever this file
disagrees.

## The Task types dashboard

Tyler, 12 Oct 2026: "tasks type should have its own dashboard". It is at
`/task-types`, in the left menu after Team, and it replaced the Task types
card that sat in Team settings.

- **Three panels**, like the project page: the team's types on the left, the
  picked type's fields in the middle, and the steps and notes a new task of
  that type starts with on the right.
- **Which team's types.** A type belongs to one team. The site admin is on no
  team, so the left panel's header has a team filter, starting on the first
  team by name and kept in the address (`?team=<id>`); new types and the order
  are saved for that team (Tyler, 19 Oct 2026, with the team dropdown gone).
  Employees see their own team's types and no filter.
- **The left panel's header** has a "+" that opens a New task type window
  (name, icon, colour, then Create task type, and the new type opens), and a
  cog that opens Task type settings for the picked type: its name, icon and
  colour, and Archive or Bring back. Each change in that window saves as it is
  made, with the Saving… line at its top, so it ends with Done. Tyler asked
  for both on 12 Oct 2026. Below 1280px wide
  they become Types, Fields and Starts with tabs.
- **The picked type is in the address** (`/task-types?type=<id>`), so a pasted
  link opens it. With none, the first type is open.
- **Everyone on the team can open it** (Tyler's choice, 12 Oct 2026) and reads
  each field as one line: "File · Needed before Done · Only the person
  assigned · Only when Platform is YouTube". Only the site admin sees the
  boxes, buttons and arrows, and only they are told how many tasks use a
  field, since that counts tasks in projects a member can't see.

## Making types

- **The site admin makes and changes types** (Tyler's choice, 11 Oct
  2026), on the Task types dashboard.
- **A type has a name, an icon and a colour.** Names are unique in a team
  whatever their capitals, like labels. A team can have up to 50 types,
  archived ones included.
- **Order** is set by dragging a type by the handle on the left of its row
  (Tyler, 12 Oct 2026). New task and the type pickers list types in that
  order. Archived types sit apart and aren't dragged. The hover covers the
  whole row, handle included.
- **Archive, never delete** (Tyler's choice, 11 Oct 2026). Archive is in the
  cog's window. An archived type leaves New task and the type picker, and
  moves under Archived in the left panel. Its tasks keep the type and every
  value, and Bring back, in the same window, undoes it.
- **Everything saves as it is changed**, with Saving…, Saved or Not saved
  beside the type's name at the top of the middle panel, or at the top of the
  cog's window.

## Fields

The middle panel lists the picked type's fields. Add field, at the top right
of the panel, opens a New field window with the name and kind (Tyler, 12 Oct
2026); the field's other settings are under its cog once it's made. The
type's icon in that header is drawn plain, like every panel header's icon.
The left panel's list shows each type's name with no icon, and how many
fields it has as a number at the end of the row (Tyler, 12 Oct 2026). The icon and its colour still show in the type pickers and on
tasks.

- **Nine kinds:** Text, Long text, Number, Link (https addresses only, so a
  link can never run anything), Date, Dropdown (one choice from the field's
  list), Checkbox, Person (someone on the task's project) and File.
- **Naming someone in a Person field tells them**, in the bell: "Ben named
  you on a task", with "Reviewer on Edit the trailer" under it, opening the
  task. They also follow the task from then on, so its chat and its Done
  reach them (Tyler, 16 Oct 2026). Naming yourself, or the task's own
  person, tells nobody, and saving the same person again says nothing new.
  A task made with the field filled tells them too. Each person can switch
  it off ("Named you in a task's field"). The rule is `tellPeopleNamed` in
  `src/server/project/task-types.ts`.
- **Drag a field by its handle** to change the order (Tyler, 12 Oct 2026:
  "the field order should be draggable"). A task's card and New task list the
  fields in that order. The new order shows at once and goes back if the save
  is refused, and nothing can be dragged while it saves. Like the List, there
  is no keyboard dragging.
- **Up to 30 fields per type** and 50 choices per dropdown.
- **A field's kind is fixed once any task has a value in it.** The row says
  "2 tasks have a value in it, so its kind stays Link."
- **Removing a field asks first** and says how many tasks have a value in it.
  The values go with it, and a File field's files are deleted from storage
  first. If storage refuses, nothing is deleted.
- **A removed dropdown choice** leaves the tasks that picked it reading as
  before, with "(removed)" after the choice.
- **An empty field shows nothing** to someone who can't change it.

Each field's cog holds four settings:

- **Needed before Done.** Nobody can mark the task Done while the field is
  empty. The refusal names the field: "Fill in Final cut first." This holds
  for the Status field, a Board drag (the card goes back to its old column
  with the same message), and ticked rows marked Done together, where the
  task is refused alone and named: "1 task marked Done, 1 refused. "Edit the
  trailer": Fill in Final cut first." The evening check-out marks picks Done
  the same way, so a pick with a needed field still empty stops the
  check-out with the same message and nothing is marked. A task already Done stays Done when a
  field is later switched on; only a fresh move to Done is checked.
- **Needed when made.** New task shows the field once the type is picked and
  won't make the task without it, naming the first one missing. A File field
  can't be needed when made, because files are added after the task exists.
- **Who can change it.** Anyone on the project (the default), only the person
  assigned, or only whoever handed it out. The site admin can always
  change it.
- **"Whoever handed it out" is whoever first handed the task out**, or
  whoever made it when nobody has, and it stays with them however the task is
  handed around later (Tyler's choice, 12 Oct 2026). Without that, the person
  doing the work could hand the task on and back to themselves and rewrite
  the brief. Only the person assigned is still open to anyone who takes the
  task, since anyone can hand a task to anyone. Everyone else reads the
  field as plain words, with the reason under it. The server checks this on
  every save, so it holds for ticked rows and anything that calls the app
  directly, not only the screen. Tyler ticked this on 11 Oct 2026, knowing it
  bends his rule that anyone who can see a project can change it.
- **Show.** Always, or "Only when Platform is YouTube": a Dropdown field of the
  same type and one of its choices. A hidden field keeps its value and comes
  back with it, and is never needed before Done or when made. A field can
  depend on one dropdown, and the dropdown can't depend on it, however far
  down the line. Removing the dropdown or the choice makes the field always
  show, and the remove question says so first.

## Starting steps and notes

- **A type can hold up to 50 steps and a notes outline.** Picking the type in
  New task fills the Steps card and the notes, and both can still be changed
  before the task is made.
- **Changing the type in New task swaps them.** The old type's steps go and
  the new one's come in; steps typed by hand stay. The notes change only if
  nobody has typed in them.
- **Picking a type on a task that already exists** only changes the type. It
  never adds steps or touches the notes.
- **Steps aren't shared lists yet.** If "Saved step lists" (More features 05,
  Part 7) is built later, a type should point at one of those lists instead of
  keeping its own.

## A task's type

- **New task has a Type picker** once the project offers any type, starting on
  the project's default. "Plain task" is no type.
- **The Task card has a Type field** for a task that exists. It lists the
  types the project offers, and the task's own type even when it is archived
  or the project no longer offers it.
- **Only whoever handed the task out and the site admin change its type**
  once it exists (Tyler's choice, 12 Oct 2026), so nobody switches a task to a
  plain one to get past "Needed before Done". Everyone else sees the field
  greyed out with that sentence under it, and the server refuses it the same
  way.
- **Changing a task's type keeps the old type's values**, hidden, so picking
  the old type again brings them back. Files in the old type's File fields
  stay with the task, hidden, and still count toward its 10.
- **The type's fields sit in their own card** under the Task card, named after
  the type with its icon. Each field saves when it is left, and a pick saves
  the moment it is made.
- **A plain task** (no type) shows no chip and no fields card. Every task made
  before 12 Oct 2026 is a plain task.
- **A chip** with the type's icon and name shows on Board cards and List rows,
  never the colour alone.

## File fields

- **Several files per field**, up to the task's 10 (Tyler's choice, 11 Oct
  2026). A field's files count toward the task's 10 and the team's 5 GB, and
  share the task's storage, download address, bin and 30-day clean-up.
- **The Files card leaves out files that belong to a field.**
- **Adding or deleting a file in a field** needs the right to change that
  field, as well as the usual rule that a file is deleted by whoever added it,
  the site admin.

## Which types a project uses

- **Project settings has a Task types card** that ticks which of the team's
  types this project offers. Every type is ticked until someone unticks it,
  so a type the team adds later is offered everywhere. Anyone who can change
  the project can change these.
- **Default type** is the one New task starts on in this project. Unticking
  the default type clears it.
- **Unticking a type changes nothing on tasks that already have it.**
- **"Just me" tasks offer every type.**
- **Moving a task into a project that doesn't offer its type** keeps the type
  and every value, after the move card says "Shop doesn't offer Video editing.
  The task keeps its type and its fields."

## Copies, moves and people leaving

- **Duplicate** carries the type and every value except files, which
  Duplicate never copies, so a File field starts empty.
- **Copy project** carries each task's type and values, and the project's own
  pick of types. Person fields start empty, since the copy starts with
  nobody on it (only the site admin copies, and isn't on projects).
- **A repeat's copy** carries the type and values. Files stay behind.
- **Move to project** keeps the type and values. A Person field naming someone
  who isn't on the new project is emptied, the same as the person assigned.
- **Leaving a project or the team** empties every Person field naming that
  person in that project's tasks, as it already did for steps.
- **No check on the way in:** Paste a list, Make it a task and repeat copies
  make tasks without the "Needed when made" check. Paste a list never sets a
  type (Tyler's choice, 11 Oct 2026), and New task says "Pasted tasks are made
  without a type. Pick their type one by one." so it can't make 30 half-filled
  tasks.

## Finding tasks by type

- **A Type filter** sits beside Label on a project's Board and List and on My
  dashboard, saved in the address as `?type=…`, so a pasted link opens the
  page filtered. Archived types are in it too, marked "(archived)", so their
  tasks can still be found.
- **Field columns.** When a project's List is filtered to one type, a Columns
  menu adds up to 3 of its fields as columns. They sort like the others, with
  blanks last either way, and a task that left the field empty shows a blank
  cell. A File field's column shows "2 files". The chosen columns are
  remembered in this browser for each type.
- **The same fields show on Board cards** (Features 16 Oct). Filtered to one
  type, the Board's Filter has the same menu, called "Fields on cards", and
  each card shows a "Platform: YouTube" line for each chosen field, under its
  chips. It is one choice for both: picking on the Board changes the List's
  columns too (Tyler, 16 Oct 2026). An empty field, and one hidden by "shown
  only when", draws nothing; a File field shows "2 files", never names.
  Phones leave the lines off, for room. Drawn by `FieldLines` in
  `src/components/project/task-board.tsx`.
- **The search box doesn't look inside field values** in this version.

## Left out

Tyler, 11 Oct 2026: a webhook button ("Ignore webhook for now"), actions when
a task becomes Done, ready-made types, field changes in the task's history, a
type's default person and due date, a warning when a task's type changes,
search inside fields, number totals, date field reminders, changing the type
of many tasks at once, types shared between teams, extra statuses per type
(his four statuses stay), and field values on the Team dashboard or in the
check-in.

## Where it lives

- **Tables:** `drizzle/0107_project_task_types.sql`: `project_task_types`,
  `project_task_type_fields`, `project_task_field_values`,
  `project_tasks.type_id`, `project_task_files.field_id`, and
  `project_projects.hidden_type_ids` and `default_type_id`; and
  `project_tasks.first_handed_out_by_user_id` in
  `drizzle/0108_project_first_handed_out_by.sql`, filled in for older tasks
  from the first hand-over in their history.
- **The kinds and their rules**, shared by the server and the screens:
  `src/lib/project/task-fields.ts` (adding a kind starts there, then its
  control in `task-fields-card.tsx`). Shapes, icons and input checks:
  `src/lib/project/task-types.ts`.
- **Rules:** `src/server/project/task-types.ts`, with the Done check in
  `setTaskStatus` and the made check in `createTask` (`tasks.ts`), and field
  files in `task-files.ts`.
- **Endpoints:** `src/lib/api/project/task-types.ts`.
- **Screens:** the dashboard in `task-types-dashboard.tsx` (route
  `src/routes/_authenticated/task-types.tsx`), its editing pieces in
  `task-type-editor.tsx`, `project-task-types-card.tsx` (Project settings), `task-fields-card.tsx`
  (the task's Type field, its fields card, and each kind's control, which New
  task uses too), `task-type-icon.tsx`, `field-columns-menu.tsx`, and
  `TypeChip` in `task-bits.tsx`.
- **The left menu link** is added by `src/server/project/navigation.ts`.
- **Tests:** `src/server/project/task-types.test.ts`,
  `src/lib/project/task-fields.test.ts`, and the dashboard and menu link in
  `project-screens.test.tsx` and `project.test.ts`.
