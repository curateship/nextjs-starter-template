# Projects and tasks

## Who sees a project

- **Only a project's members see it.** Whoever creates a project is its first
  member.
- **The team's owner and admins see every project**, without being listed as
  members. That way no project can be left with nobody able to open it.
- **Anyone who can see a project can change it**, add a teammate to it, or
  remove someone from it.
- **A project you can't see answers like one that doesn't exist.** Guessing a
  project's or task's id from another team gets "doesn't exist or you can't
  see it", never the record.
- **Archived projects are read-only.** Archive from Project settings (the cog
  on the project page) or from the Projects table. Bring back undoes it.

## Copying, due dates and progress

- **Copy project**, from the details panel or the copy button on a Projects
  row, asks for a new name and makes a project from the old one: its
  description, colour, sections and every task not in the bin, in the same
  order, with their labels and steps (unticked). Every task starts To do with
  nobody assigned and no due date (Tyler's choice, 10 Oct 2026). People,
  chat, files and history stay behind. The person copying is the new
  project's only member, and the page opens on the copy.
- **A project's due date** sits on its details panel and saves the moment one
  is picked. Clear takes it off.
- **Progress** reads "14 of 20 done" with a bar and "Due Nov 30" under it, on the details
  panel and in the Projects table's Progress column. Done counts Done tasks;
  To do, Doing and Stuck are open; tasks in the bin don't count. Once the date
  passes with tasks still open it reads "Overdue" in red.

## The project page

`/projects/<id>` is three panels side by side. Tyler asked for the four-panel
dashboard without its bottom panel, so the layout copies the CRM screen
(`src/components/crm/crm-workspace.tsx`), which already has three resizable
panels and nothing along the bottom.

- **Left: project details.** The description and how many tasks sit in each
  status, read only. The star in its header stars the project for me (see
  Stars below). The cog opens Project settings, a window with the name,
  colour, description, Archive and the project's sections. Tyler, 10 Oct 2026: "add a
  cog icon here and put all the project settings there". Each field saves when
  it is left, and the colour the moment it is picked, so the window ends with
  Done. Closing it with Escape or a click outside saves the field being typed
  in too.
- **Middle: tasks.** A Board tab with one column per status, a List tab
  with the same tasks in rows, grouped under the project's sections when it
  has any, and an Activity tab (below). A card drags between Board columns to change its status, and up or
  down to set the project's order. The tab last used is remembered in this
  browser. Clicking a task opens it here, in the Board or List's place (see
  Opening a task below).
- **Right: members.** Everyone on the project, with their role and how many
  open tasks they have. Add member lists teammates not yet on it. Clicking a
  member is the Person filter: it shows only their tasks, and clicking again
  shows everyone's.
- **Panels.** Drag the gaps to resize. Double-click blank space in a side panel,
  or drag it shut, to collapse it, and the tab on the middle panel's edge opens
  it again. Widths are remembered in this browser under the key in
  `src/lib/project/panel-keys.ts`, not in the shell's list.
- **Narrow screens.** Below 1280px wide, the page shows one panel at a time
  with Tasks, Details and Members tabs above it.

## Activity

The Activity tab, beside Board and List, is the project's own feed: "Priya
marked Build the contact form Done", newest first, 50 at a time with "Show
older".

- **What it lists:** a task made, its status changed, handed over, accepted,
  handed back, commented on, deleted and brought back, a step made its own
  task, and a task moved here. Each line opens its task, unless the task is
  in the bin.
- **Written as it happens.** It reads `project_task_events`, the same rows as
  each task's History card, with three kinds added on 11 Oct 2026 (made,
  status changed, commented). Changes from before then aren't in it.
- **Who sees it:** the same people who can see the project.
- **The History card stays the task's own story.** It shows the same moments
  for one task, except comments, which are already in its chat.

## Finding tasks

- **Search and filters.** Above the Board and List, a search box looks
  through each task's title and notes, every word typed, whatever its
  capitals. Beside it, Status, Person (anyone, nobody assigned, or one
  member) and Label filters narrow both tabs at once. Clear filters brings
  everything back, and a search that finds nothing says so.
- **They live in the address** (`?q=…&status=…&person=…&label=…`), so a
  pasted link opens the page filtered the same way.
- **Old Done tasks fold away.** The Board's Done column shows tasks finished
  in the last 14 days, then "Show 34 older" for the rest. The List tab shows
  every task. A task's finish time is saved when it becomes Done
  (`completed_at`) and cleared when it leaves Done. Tasks finished before
  10 Oct 2026 have none, and count as older.
- **Labels, sections and the shared order** are in
  [Labels and sections](labels-and-sections.md).

## Stars

- **Each person stars their own projects**, from the star on the Projects
  table's row or on the project page's details panel. Nobody else sees them.
- **Starred projects sit first** on the Projects page, whatever the table is
  sorted by.
- **Leaving a project takes its star off**, and so does leaving the team.

## Opening a task

A task opens in the middle panel of the project page and of My dashboard, in
the task list's place. Tyler asked for this on 10 Oct 2026, so a task opens
without leaving the page and without a window over it.

- **The other panels stay.** Project details and members stay on either side,
  or Me and Inbox on My dashboard.
- **Back** sits at the top left of the task. It returns to the list on the
  same tab (Board or List, Today, Open or Done), scrolled to the same spot,
  because the list is kept underneath, hidden, while the task shows.
- **The browser's own back button does the same.** Opening a task from the
  list adds a step to the browser's history, and Back takes that step back.
- **A link to a task still opens it.** The address is `?task=<id>`, so a
  pasted link or a bell notice opens the task in the middle panel. Back from a
  task that arrived by link shows the list without leaving the page.
- **Narrow screens.** Below 1280px the Tasks tab shows the task the same way,
  and opening one from the inbox switches to that tab.
- **The Team dashboard and the check-in keep the window.** Their middle panel
  isn't a task list, so a task opens there as a window over the page. Tyler
  chose this on 10 Oct 2026.
- **This is the one exception to the template's rule** that a record opens as
  a window over its list. It is Project's choice on purpose, for tasks only.
- **The same task either way.** The window and the panel draw one body
  (`src/components/project/task-body.tsx`): details, steps, files, chat and
  history.

## Tasks

- **What a task holds.** Title, formatted notes, project, the person assigned,
  who handed it out, due date, status, optional steps, files, a chat, and the
  people following it. The chat, following, notes and files are in
  [Task chat](task-chat.md).
- **Four statuses.** To do, Doing, Done and Stuck.
- **Stuck needs a reason.** Marking a task Stuck asks for one line. The reason
  shows on the task until it leaves Stuck. Whoever handed the task out gets a
  bell notice, or whoever made it when nobody handed it out.
- **Steps.** Up to 50 per task. Progress reads as "3 of 5 steps done". Tyler
  chose steps over a percentage because a percentage is a guess.
- **Due dates** are whole days. A task past its due date and not Done shows
  "Overdue".

### Making tasks quickly

- **New task in the header**, on every page. It opens the project page's
  window with a Project picker, the last project used chosen first
  (remembered in this browser). The page under it stays as it is. On a phone
  it folds into the header's three-dot menu.
- **Paste a list.** Pasting more than one line into a new task's title asks
  "Make 8 tasks, one per line?". Yes makes them all in the chosen project,
  each with the person and due date picked in the window. Blank lines and
  bullet marks (-, *, •, 1., [ ]) are left out. At most 50 at once; more is
  refused with the reason and nothing is made. "No, make one task" joins the
  lines into one title instead.
- **Duplicate**, from the task's "More" menu, makes "<title> (copy)" in the
  same project and section, with its notes, labels and steps (unticked), To
  do and nobody assigned. The chat, history and files stay with the original.
  The copy opens straight away.

### Changing tasks

- **Many at once.** Ticking rows on a project's List tab offers Status, Hand
  to, Due date and Move to project beside Mark Done. Stuck asks for one reason
  for all of them. Each task is changed on its own, as if alone, so each still
  writes its history and sends its notices, and one that can't be changed is
  refused alone. The result says "5 changed, 1 refused" with the reason.
- **Move to project**, from the "More" menu, lists my other open projects. If
  the person assigned isn't on the new one, the window says so and the task
  moves with nobody assigned (and their name kept). Steps, chat, files,
  labels and history go with it; the section stays behind, since sections are
  one project's own. People on its steps who aren't on the new project come
  off them. Past check-in lines keep the old project, because that's where
  the task was that day. On the old project's page, the page follows the task
  to its new one.
- **Make it a task.** A step that grew too big becomes its own task in the
  same project, from the step's own menu, with the step's text, person and
  date. The step leaves the old task, and both histories link to each other.

### Planning ahead

Each task has a Plan card with three fields that save the moment they change.

- **Repeat.** Every work day, every week on chosen days, or every month on a
  date. See [Repeating tasks](repeating-tasks.md).
- **Snooze until** a date. Until the person's own morning of that date, the
  task is left out of their check-in's pick list and My tasks' Open tab
  ("1 snoozed task is hidden until its day"). The project page still shows it,
  with "Snoozed until Dec 1", so whoever handed it out still sees it. "Wake it
  now" ends the snooze. A task left over from yesterday's check-in still has
  to be carried over or dropped with a reason: snoozing never answers for it.
- **Waiting on** another task in the team, picked by searching titles. The
  waiting task shows "Waiting on: Get the logo approved", and the other one
  shows "Holding up: Launch the site". When the other task becomes Done, the
  waiting one shows "Ready to start" and its person gets "Anna finished what
  your task was waiting on", once. A task can't wait on itself or on anything
  already waiting on it, however far down the line. A task in a project the
  reader isn't on reads "1 task in another project", never its title; a card
  names it only when both are in the same project. Waiting on several tasks at
  once is left out.

### Just me tasks

- **A task can be "Just me"**, picked as the project in New task or in the
  check-in's "Add a task for yourself". Only that person can see it, not even
  the owner or an admin. It shows on their My dashboard and in their
  check-in, and nowhere else.
- **On the Team dashboard** it reads "1 personal task", never its title, for
  everyone.
- **They live in a project of the person's own**, made the first time they
  use it, which never shows on the Projects page and can't be shared,
  renamed or archived. Its page (reached from a task's link) says only they
  can see it.
- **It can be moved into a project later** with Move to project (Tyler's
  choice, 10 Oct 2026), and then that project's members see it.

### The bin

- **Delete moves a task to its project's bin** for 30 days, with "Undo" on
  the message. It leaves every list at once, and its history notes who
  deleted it.
- **The Bin button** on the project's details panel lists what was deleted,
  by whom and when, with Bring back. A task comes back whole: steps, chat,
  files, labels and history.
- **Who may bring it back:** the same people who may delete it, that is
  whoever made it, the owner and admins (Tyler's choice, 10 Oct 2026).
- **Empty bin** is for the owner and admins, and asks first.
- **After 30 days** the daily job deletes the task for good, files first. If
  storage can't remove a file, the task stays in the bin and the job tries
  again on its next pass, so no file is left behind without its task.
- **Files in the bin still count** toward the team's 5 GB until it is
  emptied.
- **A check-in line about a binned task** keeps its title but can't be
  opened, and its day doesn't count it as a blocker.

### Steps with a person and a date

- **A step can name someone on the project and a due date**, from the step's
  own menu. Their photo and the date show under the step.
- **"Anna gave you a step"** reaches that person in the bell, once, when the
  step is given to them, with the task's title and the step.
- **It shows only inside the task.** A step's person doesn't get it in My
  tasks or the check-in (Tyler's choice, 10 Oct 2026). Steps are for small
  jobs two people share inside one task; anything someone should pick at
  check-in should be Make it a task.
- **Leaving the project clears them** from its steps, and so does leaving the
  team.

## Handing a task over

- **Anyone can hand a task to anyone on the project.** The task records who
  handed it out.
- **Every hand-over writes history and tells the person**, whether it's one
  task, many ticked rows, a pasted list or a step made into a task.
- **Waiting.** A task handed to someone else shows Waiting until they accept
  it. Taking a task yourself skips Waiting.
- **Accept or hand back.** The person it was handed to can accept it, or hand it
  back with a one-line reason. A handed-back task returns to whoever handed it
  out, with "Ben handed this back: …" on it. If that person has left the
  project, the task is left with nobody assigned.
- **Deleting** is for whoever made the task, the owner and admins. It moves
  the task to its project's bin (see The bin below).

## Bell notices

Nine notices about a task, each opening it in the middle panel of its project
page:

- **"Anna gave you a task"** when a task is handed to you.
- **"Ben handed a task back to you"** with the reason.
- **"Ben marked a task Stuck"** with the reason.
- **"Ben unblocked a task"** when it leaves Stuck for To do or Doing.
- **"Ben marked a task Done"** once, when it becomes Done.
- **"Anna commented on a task"** to the person assigned, whoever handed it
  out, whoever made it, and the task's followers.
- **"Anna asked you about a task"** to each person tagged with @ in the chat.
- **"Anna gave you a step"** to the person a step is given to.
- **"Anna finished what your task was waiting on"** to the person on a task
  that was Waiting on the one just marked Done.

Stuck, unblocked and Done go to whoever handed the task out, or whoever made
it when nobody did, and to the task's followers. That way the person who hands
work out hears when it's finished or moving again without asking. Marking
several rows Done sends one notice per task.

Three more come from the app itself, with nobody as the sender:

- **"Due tomorrow"** with the task's title, to the person assigned, at their
  own check-in time on the work day before the due date. When the next work
  day is after a weekend it names the day: a task due Monday says "Due Monday"
  on Friday.
- **"Overdue"** with the title, at their check-in time on the first work day
  after the date passed. Dates more than a week gone don't send one, so
  turning this on didn't flood anyone's bell with old dates.
- **"5 of 6 checked in, 1 blocked"** to the owner and admins, once per work
  day (see [The morning check-in](morning-check-in.md)).

Each task sends each reminder once per due date, and moving the date sends a
fresh one for the new day. Done tasks, tasks in archived projects and tasks
with nobody assigned send none. When more than three of one kind come at
once, such as four tasks due tomorrow, they arrive as one notice, "4 tasks due
tomorrow", which opens My dashboard.

Nobody is told about their own action, and nobody gets two notices for one
change: a tagged person gets "asked you about" instead of "commented on", and
a follower who also handed the task out gets one. A notice only goes to
someone who can still see the project, so a person who has left the team or
the project never gets a task's title in their bell. The words live in
`src/lib/project/notices.ts`, and the shell's bell reads them back to draw each
row without asking the server. Each notice sits under a Tasks tab in the bell.

## My tasks

Every task assigned to me, across every project I can see, is in the middle
of [My dashboard](my-dashboard.md), with Today, Open and Done tabs. The Open
tab is grouped by when each task is due, with Waiting for my answer first. Ticked rows can be marked Done together. A
task picked on 3 or more check-ins and still not Done shows "Picked on 4 days"
(see [History](history.md)).

## The left menu

The shell keeps its menus in the database, and an app can't edit the shell code
that writes them. So a background job (`src/server/project/navigation.ts`,
listed in `src/app/server-options.ts`) adds a "Work" section with My dashboard,
Projects and Team to the members' menu and to each admin menu.

- **Each menu gets the section once.** The job writes down which menus it has
  done in `project_navigation_added`. An admin who later removes a link in
  Settings keeps it removed.
- **Why not a migration.** On a brand-new install the first admin menu doesn't
  exist until the first admin signs in, which is after the migrations run.

## Where it lives

- **Tables:** `drizzle/0094_project_teams_projects_tasks.sql`, the chat's
  tags, followers and files in `drizzle/0097_project_task_chat_and_files.sql`,
  labels, sections, the order, `completed_at` and stars in
  `drizzle/0099_project_finding_and_sorting.sql`, and a step's person and date
  and the new history kinds in `drizzle/0100_project_making_and_changing.sql`,
  repeating, snoozing, waiting, "Just me" and the bin in
  `drizzle/0101_project_planning_ahead.sql`, and a project's due date and the
  Activity tab's kinds in `drizzle/0102_project_projects.sql`, described to
  the code in
  `src/server/project/schema.ts`.
- **Rules:** `src/server/project/projects.ts` and `src/server/project/tasks.ts`,
  with the chat, followers and files in `task-chat.ts`, `task-followers.ts` and
  `task-files.ts` beside them, and pasting, duplicating, moving, bulk changes
  and Make it a task in `task-changes.ts`, and repeat, waiting and the bin in
  `planning.ts`, with its jobs in `planning-jobs.ts` and "Just me" in
  `personal.ts`. Copy project is in `projects.ts` and the Activity tab in
  `project-activity.ts`.
- **Endpoints:** `src/lib/api/project/`.
- **Screens:** `src/components/project/`. A task's window is `task-dialog.tsx`
  and its place in the middle panel is `task-in-place.tsx`.

## Sample data to look at

`node scripts/project-sample-data.mjs you@example.com` puts a sample team on the
local database, owned by the account you name: three made-up teammates, two
projects, twenty tasks across every status (four of them Waiting), and three
weeks of check-ins.

- **The check-ins** cover the last 15 work days, with weekends as days off.
  "Set up redirects from the old site" is picked on five days in a row and
  ends Stuck, so it shows "Picked on 5 days". Leo is late now and then, drops
  two tasks with reasons, and Priya missed one day. Your own last check-in
  leaves two tasks unfinished, so your check-in window opens with them.
- **Done tasks have finish dates.** "Cookie banner" finished three weeks ago,
  so the Board's Done column shows "Show 1 older".
- **On a work day** Maya and Leo have already checked in today (Leo late) and
  Priya hasn't, so the Team dashboard's check-ins have all three states on it.
- **The team uses this machine's time zone**, so "today" is your today.
- **Local only.** It refuses any database that isn't on this machine.
- **Your account must not be on a team yet.** It refuses otherwise and changes
  nothing.
- **The made-up teammates have no password**, so nobody can sign in as them.
- **It makes no workspaces and touches no menus.**
