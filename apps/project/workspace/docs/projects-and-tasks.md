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

## The project page

`/projects/<id>` is three panels side by side. Tyler asked for the four-panel
dashboard without its bottom panel, so the layout copies the CRM screen
(`src/components/crm/crm-workspace.tsx`), which already has three resizable
panels and nothing along the bottom.

- **Left: project details.** The description and how many tasks sit in each
  status, read only. The cog in its header opens Project settings, a window
  with the name, colour, description and Archive. Tyler, 10 Oct 2026: "add a
  cog icon here and put all the project settings there". Each field saves when
  it is left, and the colour the moment it is picked, so the window ends with
  Done. Closing it with Escape or a click outside saves the field being typed
  in too.
- **Middle: tasks.** A Board tab with one column per status, and a List tab
  with the same tasks in rows. A card drags between Board columns to change its
  status. The tab last used is remembered in this browser. Clicking a task
  opens it here, in the Board or List's place (see Opening a task below).
- **Right: members.** Everyone on the project, with their role and how many
  open tasks they have. Add member lists teammates not yet on it. Clicking a
  member shows only their tasks in the middle panel, and clicking again shows
  everyone's.
- **Panels.** Drag the gaps to resize. Double-click blank space in a side panel,
  or drag it shut, to collapse it, and the tab on the middle panel's edge opens
  it again. Widths are remembered in this browser under the key in
  `src/lib/project/panel-keys.ts`, not in the shell's list.
- **Narrow screens.** Below 1280px wide, the page shows one panel at a time
  with Tasks, Details and Members tabs above it.

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

## Handing a task over

- **Anyone can hand a task to anyone on the project.** The task records who
  handed it out.
- **Waiting.** A task handed to someone else shows Waiting until they accept
  it. Taking a task yourself skips Waiting.
- **Accept or hand back.** The person it was handed to can accept it, or hand it
  back with a one-line reason. A handed-back task returns to whoever handed it
  out, with "Ben handed this back: …" on it. If that person has left the
  project, the task is left with nobody assigned.
- **Deleting** is for whoever made the task, the owner and admins. The task's
  files leave storage first. If storage can't remove them, the task isn't
  deleted and the person is told to try again, so no file is left behind
  without its task.

## Bell notices

Six notices, each opening the task in the middle panel of its project page:

- **"Anna gave you a task"** when a task is handed to you.
- **"Ben handed a task back to you"** with the reason.
- **"Ben marked a task Stuck"** to whoever handed it out and the task's
  followers, with the reason.
- **"Ben marked a task Done"** to the task's followers, once, when it becomes
  Done.
- **"Anna commented on a task"** to the person assigned, whoever handed it
  out, whoever made it, and the task's followers.
- **"Anna asked you about a task"** to each person tagged with @ in the chat.

Nobody is told about their own action, and nobody gets two notices for one
message: a tagged person gets "asked you about" instead of "commented on". A notice only goes to someone who can
still see the project, so a person who has left the team or the project never
gets a task's title in their bell. The words live in
`src/lib/project/notices.ts`, and the shell's bell reads them back to draw each
row without asking the server. Each notice sits under a Tasks tab in the bell.

## My tasks

Every task assigned to me, across every project I can see, is in the middle
of [My dashboard](my-dashboard.md), with Today, Open and Done tabs. Tasks
Waiting for my answer come first. Ticked rows can be marked Done together. A
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

- **Tables:** `drizzle/0094_project_teams_projects_tasks.sql`, and the chat's
  tags, followers and files in `drizzle/0097_project_task_chat_and_files.sql`,
  described to the code in `src/server/project/schema.ts`.
- **Rules:** `src/server/project/projects.ts` and `src/server/project/tasks.ts`,
  with the chat, followers and files in `task-chat.ts`, `task-followers.ts` and
  `task-files.ts` beside them.
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
- **On a work day** Maya and Leo have already checked in today (Leo late) and
  Priya hasn't, so the Team dashboard's check-ins have all three states on it.
- **The team uses this machine's time zone**, so "today" is your today.
- **Local only.** It refuses any database that isn't on this machine.
- **Your account must not be on a team yet.** It refuses otherwise and changes
  nothing.
- **The made-up teammates have no password**, so nobody can sign in as them.
- **It makes no workspaces and touches no menus.**
