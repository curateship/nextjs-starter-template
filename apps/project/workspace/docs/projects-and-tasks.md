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
- **Archived projects are read-only.** Archive from the project's details
  panel or from the Projects table. Bring back undoes it.

## The project page

`/projects/<id>` is three panels side by side. Tyler asked for the four-panel
dashboard without its bottom panel, so the layout copies the CRM screen
(`src/components/crm/crm-workspace.tsx`), which already has three resizable
panels and nothing along the bottom.

- **Left: project details.** Name, colour and description, edited in place.
  Each saves when it is left, and the colour the moment it is picked. Archive
  sits here too.
- **Middle: tasks.** A Board tab with one column per status, and a List tab
  with the same tasks in rows. A card drags between Board columns to change its
  status. The tab last used is remembered in this browser.
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

## Tasks

- **What a task holds.** Title, notes, project, the person assigned, who handed
  it out, due date, status, optional steps and comments.
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
- **Deleting** is for whoever made the task, the owner and admins.

## Bell notices

Four notices, each opening the task on its project page:

- **"Anna gave you a task"** when a task is handed to you.
- **"Ben handed a task back to you"** with the reason.
- **"Ben marked a task Stuck"** to whoever handed it out, with the reason.
- **"Anna commented on a task"** to the person assigned, whoever handed it out
  and whoever made it.

Nobody is told about their own action. A notice only goes to someone who can
still see the project, so a person who has left the team or the project never
gets a task's title in their bell. The words live in
`src/lib/project/notices.ts`, and the shell's bell reads them back to draw each
row without asking the server. Each notice sits under a Tasks tab in the bell.

## My work

`/my-work` lists every task assigned to me across every project I can see,
with an Open tab and a Done tab. Tasks Waiting for my answer come first.
Ticked rows can be marked Done together.

## The left menu

The shell keeps its menus in the database, and an app can't edit the shell code
that writes them. So a background job (`src/server/project/navigation.ts`,
listed in `src/app/server-options.ts`) adds a "Work" section with Projects, My
work and Team to the members' menu and to each admin menu.

- **Each menu gets the section once.** The job writes down which menus it has
  done in `project_navigation_added`. An admin who later removes a link in
  Settings keeps it removed.
- **Why not a migration.** On a brand-new install the first admin menu doesn't
  exist until the first admin signs in, which is after the migrations run.

## Where it lives

- **Tables:** `drizzle/0094_project_teams_projects_tasks.sql`, described to the
  code in `src/server/project/schema.ts`.
- **Rules:** `src/server/project/projects.ts` and `src/server/project/tasks.ts`.
- **Endpoints:** `src/lib/api/project/`.
- **Screens:** `src/components/project/`.

## Sample data to look at

`node scripts/project-sample-data.mjs you@example.com` puts a sample team on the
local database, owned by the account you name: three made-up teammates, two
projects and twenty tasks across every status, four of them Waiting.

- **Local only.** It refuses any database that isn't on this machine.
- **Your account must not be on a team yet.** It refuses otherwise and changes
  nothing.
- **The made-up teammates have no password**, so nobody can sign in as them.
- **It makes no workspaces and touches no menus.**
