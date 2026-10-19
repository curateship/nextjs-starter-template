# Projects and tasks

## Who sees a project

- **Only the site admin makes projects** (Tyler, 16 Oct 2026: "only I
  create projects"): New project, Copy project and Archive show to the site
  admin alone on the Projects page, and the server refuses anyone else. A
  new project starts with nobody on it; the site admin adds people in
  Project settings.
- **Only a project's members see it.**
- **The site admin sees every project**, "Just me" lists included, without
  being listed as a member, and isn't made a member of the projects they
  create. That way no project can be left with nobody able to open it.
- **Every team's projects on one page.** Tyler, 19 Oct 2026: "Admin sees all
  project. The project dashboard can have a filter by team dropdown." The
  site admin's Projects table has a Team column and a team filter, "All
  teams" then each team by name, kept in the address (`?team=<id>`) so a
  reload or a pasted link keeps it. Employees are on one team and see
  neither. New project asks which team, starting on the filter's team, and
  offers that team's templates.
- **The toolbar's order:** the search first (Tyler, 19 Oct 2026), then
  Archive for ticked rows, the team filter, the client menu and New project.
- **A project's settings are the site admin's alone** (Tyler, 16 Oct 2026:
  "Employees dont even see the settings cog or page. Only admin see it"):
  the name, colour, description, due date, Doing limit, client, members,
  lead, "Everyone on the team", status, sections, task types, Save as
  template and Archive. Employees see no cog, and the server refuses each
  one: "Only the site admin changes a project's settings."
  (`requireProjectSettings` in `src/server/project/access.ts`). A person's
  own "Just me" list keeps its sections in their hands.
- **Everyone on a project works in it**: tasks, steps, milestones, chat and
  files. A task type's field can be limited to the person assigned or to
  whoever handed the task out (Tyler, 11 Oct 2026; see
  [Task types](task-types.md)).
- **A project you can't see answers like one that doesn't exist.** Guessing a
  project's or task's id from another team gets "doesn't exist or you can't
  see it", never the record.
- **Archived projects are read-only.** Archive from Project settings (the cog
  on the project page) or from the Projects table. Bring back undoes it. The
  details panel tells the site admin "Bring it back from Project settings to
  work on it." and an employee "The site admin can bring it back."
- **An empty Members card** says "Nobody is on this project." and adds
  "Invite a teammate so tasks can be handed to them." only when Invite is
  there to do it.
- **Everyone on the team.** A switch in Project settings puts every
  teammate on the project, and anyone who joins the team later, by invite or
  by the join link, goes on it as they join. Turning it on first asks "Show
  this project to everyone on the team?", because they all see its tasks,
  chat and files. While it is on, Invite, Remove and Leave are gone from the
  Members card and the server refuses them. Tyler left this choice to me on
  15 Oct 2026, so it is the default: a project that says it includes
  everyone really does. Turning it off keeps everyone on as an ordinary
  member, who can then be taken off by hand. Leaving the team still takes
  someone off every project, this one included. Saved in
  `project_projects.whole_team`; the join step is `joinWholeTeamProjects` in
  `src/server/project/whole-team.ts`.

## Copying, due dates and progress

- **Copy project**, from the copy button on a Projects row (the project
  page has none, Tyler's choice, 11 Oct 2026), asks for a new name, starting as "Copy of Website launch", selected,
  so typing replaces it and Copy project works at once. It makes a project
  from the old one: its
  description, colour, sections, milestones (with no dates) and every task
  not in the bin, in the same order, with their labels, milestone, steps
  (unticked), types and field values, and the project's own pick of task
  types. The status, lead and client stay behind. Every task starts To do with
  nobody assigned and no due date (Tyler's choice, 10 Oct 2026). People,
  chat, files and history stay behind, and Person fields start empty. Only
  the site admin copies, and the copy starts with nobody on it, like a new
  project. The page opens on the copy.
- **A project's due date** sits in Project settings (the cog) and saves the
  moment one is picked (Tyler, 11 Oct 2026: "the due date should be in the
  settings cog"). Clear takes it off.
- **Progress** reads "14 of 20 done" with a bar and "Due Nov 30" under it, in
  the Projects table's Progress column. The project page's details panel has
  no task counts (Tyler removed them 11 Oct 2026). Done counts Done tasks;
  To do, Doing and Stuck are open; tasks in the bin don't count. Once the date
  passes with tasks still open it reads "Overdue" in red.

## Project status

So anyone scanning the Projects table sees which jobs are in trouble, and why.

- **On track, At risk or Off track**, with one line of why, such as "Client
  hasn't sent the photos". At risk and Off track need the line; On track
  doesn't. "No status" takes it off. In the code it is called `health`, so
  it never mixes with a task's four statuses.
- **The date always shows.** Under the status: "Set by Priya, 2 days ago",
  with the exact time on hover, because a status nobody has touched for weeks
  shouldn't read as today's.
- **Where it shows:** in a folding Status card at the bottom of the project
  page's details panel, and in the Projects table's Status column, where it
  is the status with an "i" beside it; the reason and "Set by" are in the
  "i"'s tooltip, so the row stays one line (Tyler, 16 Oct 2026). The
  card's heading reads "Status  ● At risk", with a gap and no dot between,
  so a folded card still says it. Its cog shows only while the card is
  pointed at and opens a dropdown, not a window (Tyler, 15 Oct 2026). Sorting by Status puts
  Off track first, then At risk, On track and no status. A project with no
  status shows nothing in the column. On the panel, the card shows only to
  someone who can set a status, saying "No status yet".
- **Who sets it.** The site admin alone, since a status is one of the
  project's settings (Tyler, 16 Oct 2026). Before that the lead set it. A
  "Just me" list has no status.
- **Each change is a line on the Activity tab**: "Priya set the project's
  status to At risk: Client hasn't sent the photos", or "took the project's
  status off". These lines have no task to open.
- **Everyone on the project hears it in the bell** when it goes At risk or
  Off track, and again when it goes back to On track or the status is taken
  off (Tyler, 16 Oct 2026): "Sam marked a project At risk", with "Website:
  Client hasn't sent the photos" under it, opening the project. Whoever set
  it isn't told. Saying the same status again tells nobody, and nor does On
  track set where there was no status. A whole-team project tells the whole
  team. Within an hour, a new change replaces the earlier row in each
  person's bell, so a status set and taken back by mistake never stacks up.
  Each person can switch it off ("Changed a project's status").
- **An archived project keeps its last status**, and it can't change until
  the project is brought back.
- **Saved** in `project_projects.health`, `health_note`, `health_by_user_id`
  and `health_at`, and each change in `project_project_events`
  (`drizzle/0117_project_more_for_projects.sql`). The rule is
  `setProjectHealth` in `src/server/project/projects.ts`; the screens are in
  `project-health.tsx`.

## The lead

So every project has one person answerable for it.

- **One member is the lead.** The crown on a row of Project settings'
  Members card names them, and pressing it on the lead's row takes it off.
  The lead's row says "Lead". Their name shows on the details panel and in
  the Projects table's Lead column.
- **Anyone who can change the project picks the lead.** Members keep every
  right they had; the only thing the lead adds is who sets the status.
- **The lead hears every Stuck, unblocked and Done** on the project, as if
  following every task, and not the chat (Tyler, 15 Oct 2026). Someone who
  is the lead and also handed the task out, or follows it, still gets one
  notice for one change.
- **A lead who leaves the project, or the team, leaves it with no lead.**
- **Saved** in `project_projects.lead_user_id`.

## Milestones

So a long project shows whether it's on time well before its end date.

- **A name and a date**, such as "Design signed off, Nov 15", in a folding
  Milestones card at the bottom of the details panel, under Status (Tyler,
  15 Oct 2026), soonest first and the ones with no date last. The "+" in the
  card's heading makes one and the cog on a row changes or deletes it. The
  heading reads "Milestones  3", a gap and no dot, the same as Status.
- **A milestone's tasks.** The list icon beside a row's cog, centred on the
  row with it, opens a dropdown of every task in that milestone, in the
  project's order, each with its status dot and status. Clicking one opens it
  in the right panel. It shows on an archived project too, since it changes
  nothing. Each task card carries `milestoneId` for this. Both
  show only while pointed at, and open a dropdown, not a window. Anyone
  who can change the project can do all three, up to 30 per project.
- **Each reads "3 of 5 done, Nov 15"** with a bar, and turns red with
  "Overdue" once its date has passed with tasks still open. Tasks in the bin
  don't count, and a milestone with no tasks reads "No tasks yet".
- **A task joins one from its Plan card** (the Milestone field, shown once
  the project has milestones). A task belongs to at most one. Moving a task
  to another project takes it off; Duplicate keeps it; a repeating task's
  next copy keeps it, unless the milestone's date has already passed (see
  [Repeating tasks](repeating-tasks.md)).
- **Deleting a milestone** leaves its tasks where they are, counting toward
  none.
- **The Calendar tab marks milestone days** with a flag and the name.
- **The Team calendar shows them too**, with "Due dates" on, beside the
  project's own due date (see [Meetings](meetings.md), "Due dates on the
  calendar"). A milestone whose tasks are all Done leaves it.
- **"Milestone due tomorrow" reaches the lead** in the bell, at their own
  check-in time on the work day before ("Milestone due Monday" before a
  weekend), with "Launch · Website" under it, opening the project. With no
  lead it goes to the site admin (Tyler, 16 Oct 2026). A milestone
  whose tasks are all Done, or in an archived project, sends nothing. Moving
  the date sends a fresh one. Time off and team holidays wait, as for tasks.
  Each send is claimed in `project_milestone_reminders`
  (`drizzle/0118_project_features_16_oct.sql`) by `sendMilestoneReminders`
  in `src/server/project/reminder-jobs.ts`.
- **Copy project and templates** copy milestones with no date, the same rule
  as tasks, and keep which tasks belong to each.
- **A milestone is not a section.** A section is where a task sits; a
  milestone is when a set of tasks must be finished (see
  [Labels and sections](labels-and-sections.md)).
- **Saved** in `project_milestones` and `project_tasks.milestone_id`. Rules
  in `src/server/project/milestones.ts`; the panel's list is
  `project-milestones.tsx`.

## Clients

So an agency with many projects for a few clients finds things fast.

- **A Client field in Project settings**, picked from the clients already
  used on projects I can see, or typed new ("Use "Hart Dental""). A name
  differing only in capitals picks the one already used, so a client never
  splits into two groups. It is a name, not a client record with contacts.
- **The Projects table** shows the client under each project's name, and has
  a client menu once any project has one: All clients, each client, No
  client, then "Group by client" under a line, ticked while it is on (Tyler
  moved the switch into the menu on 19 Oct 2026). The menu stays open when
  grouping is switched, so the tick shows the change. Grouped, clients run A to Z with "No
  client" last, each under its own heading row, and starred projects still
  come first inside each group.
- **Narrowing to one client** (Features 16 Oct). A Client choice in My
  dashboard's Filter, on the Team dashboard's Workload tab and in the Team
  calendar's view menu (with Due dates on) shows only that client's projects,
  or those with "No client". Names match ignoring capitals and spaces at the
  ends, and only clients of projects the person can see are listed. The
  choice lives in the page's address (`?client=`), so a pasted link keeps it,
  and on the Team dashboard one choice covers both the calendar and
  Workload. A saved view on My dashboard keeps it (Tyler, 16 Oct 2026). A
  project page has no Client filter, since all its tasks share one client.
  The matching is `src/lib/project/clients.ts`; the list of names is
  `visibleClients` in `src/server/project/clients.ts`.
- **Saved** in `project_projects.client`.

## Templates

So a team that runs the same kind of job starts each one in a click.

- **"Save as template"** in Project settings, beside Archive, asks for a name
  (the project's own, selected) and keeps the project's plan: its colour,
  description, sections, milestones, tasks with their steps, labels, type,
  field values and priority, and its pick of task types. That is what Copy
  project carries (Tyler, 15 Oct 2026).
- **A template is a copy taken when it was saved**, so changing the project
  afterwards never changes the template.
- **New project offers "Start from"**: an empty project or one of the
  team's templates. A template brings its colour and description, so those
  two fields hide once one is picked. Every task starts To do, with nobody
  assigned and no dates, and the person starting it is the only member.
- **A template never shows on the Projects page.** Team settings lists them
  under Project templates; the site admin renames and deletes them there,
  everyone else reads the list. Deleting one leaves the projects already
  started from it.
- **Templates stay inside one team.** Another team's template answers as
  gone.
- **Anything a template names that the team has since deleted** (a label, a
  type's field) is left out when a project starts from it.
- **Saved** in `project_templates`, its plan as JSON. The rules are in
  `src/server/project/templates.ts`, and the reading and writing of a plan,
  shared with Copy project, in `src/server/project/project-plans.ts`.

## The project page

`/projects/<id>` is three panels side by side. Tyler asked for the four-panel
dashboard without its bottom panel, so the layout copies the CRM screen
(`src/components/crm/crm-workspace.tsx`), which already has three resizable
panels and nothing along the bottom.

Tyler drew the page as it is now on 13 Oct 2026
(`assets/pasted-image-1791936316739365000.png`): the task moved from the
middle panel to the right, so the Board stays in view beside it, and the
members moved to the left. On 14 Oct 2026 he redrew the tasks panel's header
(`assets/pasted-image-1792006703561170000.png`) and moved picking whose tasks
show out of the left panel and into that header.

- **Left: details.** From the top: "Description" as a small capital heading,
  the lead and the client, then the Status card (see Project status) and the
  Milestones card at the bottom. The two cards fold, and each remembers in this browser
  whether it was left open. Tyler took Save as template off this panel on
  15 Oct 2026; it is in Project settings. The star in the header stars the project for me
  (see Stars below). The cog opens Project settings, a window with the name,
  colour, description, client, due date, Doing limit, Everyone on the team,
  Save as template, Archive, its members and its sections. Tyler, 10 Oct 2026: "add a
  cog icon here and put all the project settings there". Each field saves when
  it is left, and the colour and due date the moment they are picked, so the window ends with
  Done. Closing it with Escape or a click outside saves the field being typed
  in too. The Members card lists each member with their job title and how
  many open tasks they have, with leave or remove at the row's end. "+ Invite"
  lists teammates not yet on the project, and for the site admin ends
  with "Invite someone new to the team", the team's invite window.
- **Middle: tasks.** Board, List, Calendar and Timeline tabs, then More, which
  holds Activity, Files, Chat and the Bin. While Activity, Files or Chat
  shows, More wears its name. The tabs are words with a line under the one
  showing, sitting on the header's bottom edge, as Tyler drew them on 14 Oct
  2026. Everywhere else the UI rules' grey pills stay; this header is the one
  exception, by his choice. The Board has one column per status, each
  headed by the status's dot (To do yellow, Doing blue, Done green, Stuck
  red), as tall as its cards. The List has the same tasks in rows, grouped
  under the project's sections when it has any. Its tick boxes and drag
  handles stay hidden until a small "Mass select" chip is pressed. The chip
  appears beside the Task heading's sort arrow when the pointer is over that
  heading, and always on a phone, which has no pointer to hover. While it is on it stays shown and reads "Hide select", which
  hides the tick boxes and handles again and clears the ticks (Tyler, 19 Oct 2026). Each visit starts with them hidden, and someone who
  can only read the project never sees the chip. Each row's Actions holds the cog,
  which opens the task, and a bin that deletes it after asking, the same as
  the Board card's Delete. The bin shows only on tasks I made, or on every
  task for whoever runs the team. The Calendar shows due dates
  and the Timeline start days and due dates (all below). A task with
  messages I haven't read says "3 new" on its card and row, and More and
  Chat say the same for the project's chat (see
  [Task chat](task-chat.md#new-messages)). The header's right end holds, in
  order: the due-date dropdown ("All time"), the search as a magnifying
  glass, Filter, Views, whose tasks show (the members' faces, with no
  background), and New task
  (see Search and filters below). Under 896px wide the dropdowns drop their
  words for their icons, and under 768px New task shows only its plus. A
  panel narrower still, such as on a phone, scrolls the tabs sideways.
- **Board columns move.** Drag a column by its heading to the left or right
  to change the order of To do, Doing, Done and Stuck (Tyler, 14 Oct 2026).
  The order belongs to the project: everyone on it sees the same one, it
  shows at once and is put back if the save is refused, and it lasts after a
  reload. Grouped by person, moving a column in one row moves it in every
  row. The "+" in the heading still clicks, since a drag starts only after
  the pointer has moved 8px. An archived project's columns don't move. Only
  the Board follows the order; the List, the status dropdowns and the
  filters keep the usual one. Saved in `project_projects.status_order`
  (migration 0115); empty is the usual order, and a status the saved order
  leaves out goes at the end (`boardStatusOrder` in `src/lib/project/rules.ts`).
- **Each Board column has a "+"** at the right of its heading. It opens the
  New task dropdown (see Making tasks quickly) for that column: the task is
  made and moved there, and in Stuck the dropdown asks "Why is it stuck?"
  first. Grouped by person, the "+" in a person's row hands the task to them,
  and in "Nobody assigned" to nobody. A move the server refuses, such as Done
  with a field still empty, leaves the task in To do and says why.
  A card drags between Board columns to change its status, and up or down
  to set the project's order. The Board and List change on their own when
  someone else changes a task (see [Task chat](task-chat.md#live-updates)).
  The tab last used is remembered in this browser.
- **A Board card** shows the title; the type, section and labels as small
  tinted chips (a High priority mark first); "Date moved 5 times" as a
  yellow chip; a Stuck reason or a hand-back; then one line with the due
  date ("Oct 19 by 3:06 PM", or "Overdue · Oct 12" in red), steps as "0/2",
  the message count, "Waiting" while a task it waits on is open (or
  "Ready"), and the person at the line's end. A task with no due date shows
  no date. The card of the task open on the right is outlined.
- **A card's "..."** shows at its top right while it is pointed at (always on
  a touch screen). It opens Duplicate, which makes the copy and opens it on
  the right, and Delete, which asks the bin's question first. Delete shows
  only to whoever made the task and the site admin, the same
  people the server lets delete it. An archived project's cards have no "...".
- **Right: the open task.** Clicking a task opens it here (see Opening a
  task below). With none open, the panel says "Click a task to see its steps
  and chat here."
- **Panels.** Drag the gaps to resize. Double-click blank space in a side panel,
  or drag it shut, to collapse it, and the tab on the middle panel's edge opens
  it again. Widths are remembered in this browser under the key in
  `src/lib/project/panel-keys.ts`, not in the shell's list.
- **A project that's gone**, or that this person can't see, shows "That
  project doesn't exist or you can't see it." with Back to Projects, from the
  route's own error screen (`project-route-error.tsx`). Other load failures
  keep the shell's card with Try again.
- **Browser tabs** name the page: "My dashboard · Project", the project's own
  name on its page, "Team", "Members", "Invite" and "Join". Each route sets
  its title in its `head` (`src/lib/project/page-title.ts`). After a full
  reload the shell renames the tab to the app name alone until the next page
  change; that is the shell's `useShellDocumentTitle`.
- **Narrow screens.** Below 1280px wide, the page shows one panel at a time
  with Tasks, Details and Task tabs above it. Opening a task switches to the
  Task tab, and closing it switches back to Tasks. All three stay loaded and
  the hidden two can't take the keyboard, so switching tabs keeps each one's
  own tab, scroll and lists (`three-panels.tsx`, shared with My dashboard and
  the Team dashboard).

## The Board grouped by person

So whoever runs a project sees who is stuck and who is idle in one view.

- **"Group by person"** is a switch in the Filter popover, on the Board only. On, the Board
  has one row per member of the project, then "Nobody assigned", each with
  the four status columns. The choice is remembered in this browser. A "Just
  me" list has no switch.
- **Each row's header** shows the person and "3 open · 1 Doing · 1 Stuck", or
  "Nothing open", so an idle person stands out. Clicking it folds the row,
  for a long member list.
- **Dragging within a row** changes the status and the order, the same as
  the plain Board.
- **Dragging to another row hands the task over, after asking first:**
  "Hand this task to Priya?" with Hand over and Cancel. It's the same
  hand-over as the task's person picker, so Priya is told and has to accept
  it. Dropped in "Nobody assigned" it asks "Take everyone off this task?".
  Dropped in another person's Stuck column it is refused with "Hand it over
  first, then mark it Stuck from its own row", since Stuck needs a reason.
- **The Doing limit's warning** sits in that person's own row.
- **Someone assigned who has left the project** still gets a row, so no task
  goes missing from the Board.

## The Calendar tab

So a crowded week is obvious at a glance.

- **A month** with each task on its due date, as a chip in its status
  colour: To do white, Doing blue, Stuck red with its mark, Done greyed and
  struck through. Each chip also says its status to a screen reader, so
  colour is never the only sign.
- **"No date"** lists the tasks with no due date, beside the month once the
  tasks panel is about 830px wide, and under the month before that, so the
  day squares stay wide enough to read. At the project page's usual width
  on a laptop it sits under the month. A chip's title runs to two lines
  before it is cut with "…".
- **Dragging a task to another day** saves that day as its due date. It's
  the same save as picking the date on the task, so a due-date reminder
  follows the new day. Dropping one on "No date" clears its date.
- **The filters above apply**, the same as on the Board and List.
- **Milestone days** carry a flag and the milestone's name above the tasks.
- **Arrows and Today** move between months. The header says how many tasks
  are due in the month.
- **It's the Team dashboard's month grid**, shared in
  `src/components/project/month-grid.tsx`, not a second drawing of one.

## The Timeline tab

So the site admin sees how a project's work overlaps over the coming weeks.

- **A start day on any task.** Inside the task, "Start day" sits above
  "Due date" in the cog's Dates card. A set day shows a small cross at the
  right end of its box that empties it, in place of a Clear button under it
  (Tyler, 14 Oct 2026); New task's due date has the same cross. It can be left empty, and it can never be
  after the due date: setting either end the wrong way round, from the task,
  the Calendar, the Timeline or a bulk change, is refused with "The start
  day can't be after the due day. Move the due day first." A bulk change
  refuses only the tasks it would break.
- **Six weeks at a time**, from the Monday a week before today. The arrows
  move two weeks, and Today comes back. Weekends are shaded and today is
  marked.
- **Only a task with both dates is a bar**, from its start day to its due
  date, under the project's sections like the List. A task missing either
  one stays off the Timeline (Tyler, 13 Oct 2026). The bar is in its status colour and says its status and who has
  it; a one-day bar is too short for words, so its label carries them. A
  task outside the six weeks shows its dates at the edge with an arrow.
- **Dragging changes the dates:** the bar's left end moves the start day,
  its right end the due date, and its middle both. Each is the same save as
  picking the date on the task, so a moved due date writes the same history
  line. Clicking a bar, or the task's name on the left, opens the task.
- **Waiting tasks carry a mark**, the hourglass, beside their name. There
  are no arrows between bars (Tyler, 13 Oct 2026).
- **Tasks without both dates** are counted in the header ("2 tasks without
  both dates"), not drawn. The filters above apply.
- **On a phone** the timeline scrolls sideways inside its panel; the page
  itself never does.
- **Duplicate keeps the start day.** A repeating task's next copy gets its
  own due date but no start day, and a copied project's tasks start with no
  dates at all, the same as their due dates.

## Activity

The Activity tab, beside Board and List, is the project's own feed: "Priya
marked Build the contact form Done", newest first, 50 at a time with "Show
older". Each line says how long ago, with the exact time on hover.

- **What it lists:** a task made, its status changed, handed over, accepted,
  handed back, commented on, put in the bin and brought back, a step made its
  own task, a task moved here, and the project's own status set or taken
  off (from 15 Oct 2026, read from `project_project_events` and merged in by
  time). Each is a full sentence, worded the same
  as on the task's History card ("put Logo in the bin", "put it in the bin").
  A status the app doesn't know reads "changed the status of Logo".
- **"Show older" says when it fails**, with Try again in its place. Each line opens its task, unless the task is
  in the bin.
- **Written as it happens.** It reads `project_task_events`, the same rows as
  each task's History card, with three kinds added on 11 Oct 2026 (made,
  status changed, commented). Changes from before then aren't in it.
- **Who sees it:** the same people who can see the project.
- **The History card stays the task's own story.** It shows the same moments
  for one task, except comments, which are already in its chat.
- **The Team dashboard has the same feed for every project** (see
  [Teams and invites](teams-and-invites.md#the-teams-activity)).

## The Files tab

"Where was that logo file?" has one place to look.

- **Every file in the project, newest first:** on its tasks' Files cards, in
  their File fields, sent in their chats, and sent in the project's own
  chat. Files on tasks in the bin, and on project-chat messages that were
  deleted, are left out. Up to the newest 500 show.
- **Each row** has a small picture or a file icon, the name (which
  downloads it), its size, who added it and when, and where it lives: the
  task's name, which opens the task, or "In the project's chat", which
  opens the Chat tab.
- **Each file downloads under its own rules**, through the same address as
  everywhere else, so someone who can't see a task can't fetch its files.
- **It follows changes live**, the same as the Board.
- **A "Just me" list has no Files tab**, the same as it has no Chat tab.
- **Where it lives:** `listProjectFiles` in `src/server/project/task-files.ts`
  and `src/components/project/project-files.tsx`.

## The project's chat

The Chat tab, after Files, is where talk about the project as a whole
goes, so it no longer ends up on whatever task was open.

- **The same chat as a task's**: @ tags, # links, reactions, replies, files,
  editing and deleting, all as [Task chat](task-chat.md) describes, and it
  updates as messages are sent.
- **Who can read and write it:** the people who can see the project, which is
  its members and the site admin. Anyone else gets "That project
  doesn't exist or you can't see it." An archived project's chat can be read
  but not written in.
- **It tells people only when they're tagged or replied to.** "Anna tagged you
  in a project chat", or "Anna replied to you in a project chat" (Tyler, 12
  Oct 2026), with the project's name and the start of the message under it.
  Tagged and replied to at once is one notice. Either opens the project on
  its Chat tab (`?chat=1`).
- **Someone who leaves the project stops getting its tags**, because tagging
  them is refused once they're off it, and a reply to their old message tells
  only someone who can still see the project.
- **Files have no count here.** Each is at most 10 MB, within the team's
  5 GB (Tyler, 12 Oct 2026).
- **50 messages at a time**, newest at the bottom, with "Show earlier
  messages" at the top.
- **A "Just me" list has no Chat tab**, since nobody else can read it.
- **"3 new" on the Chat tab** while it holds messages I haven't read.
  Opening it reads them.
- **Polls and `@project`** work here: a question with 2 to 6 choices, and a
  tag for everyone on the project (see [Task chat](task-chat.md#polls)).
- **Talk, not an announcement.** The project chat is talk among the people
  on one project. The team's announcement is one pinned message to the
  whole team (see [Teams and invites](teams-and-invites.md#the-teams-announcement)).
- **Where it is saved:** in `project_task_comments` beside the task chats,
  with `project_id` set and no task.

## Finding tasks

- **Search every project.** "Search tasks…" in the header, beside New task,
  opens a window that looks through titles and notes in every project the
  person can see, and their own "Just me" list, every word typed, whatever
  its capitals. It lists up to 20 matches, a title match first, each with
  its project's name and status, and "Archived" for an archived project.
  Clicking one, or Enter for the first, opens it on its project page. A task
  in a project the person isn't on never shows, and neither does one in the
  bin, someone else's "Just me" task, or a word that is only in a # link to
  another task. On a phone it folds into the header's three-dot menu.
- **Saved views.** With a search or filter on, Save as view, at the foot of
  the Filter popover on the project page (Save view on My tasks), asks for a name (the filters to start with, such as "Stuck ·
  Leo") and keeps them. The Views menu lists them, each with what it shows.
  "Delete views…" at its foot turns the rows into delete buttons until the
  menu closes. Opening one sets the same filters, and so the same
  address, as picking them by hand. Views are each person's own, kept per
  project and on My tasks, and nobody else sees them. A view naming someone
  no longer on the project, a deleted label or a type that's gone opens
  without that filter and says so, such as "Leo isn't on this project any
  more, so "Leo's stuck tasks" opened without that filter." Leaving a
  project deletes my views on it, and leaving the team deletes them all. At
  most 30 in one place.
- **Search and filters.** The magnifying glass opens the search box, which
  looks through each task's title and notes, every word typed, whatever its
  capitals. It doesn't look inside a task type's fields. The box stays open
  while it holds words; Escape empties and closes it. Filter opens a popover
  with Status, Priority, Label and Type, which narrow the Board, List,
  Calendar and Timeline at once, then Group by person, then Clear and Save as
  view. Filter counts the filters set, "Filter 2", and Clear leaves the
  header's own two dropdowns alone. Save as view with nothing picked
  says "Search or pick a filter first, then save it as a view." A search that
  finds nothing says so.
- **Whose tasks show** is the dropdown with the members' faces: All members
  with the project's open tasks, each member with their job title and open
  tasks ("Designer · 3 open tasks"), and Unassigned. The button shows the one picked.
  A "Just me" list has none. A link naming someone who has left the project
  keeps filtering and reads "Someone no longer on the project".
- **The due-date dropdown** is All time, Overdue, Today, This week, Next
  week and No date, on the reader's own clock. This week is today and the
  six days after it; Next week is the seven after those. Overdue leaves out
  Done tasks and counts a task due today by a time that has passed, the same
  as the red date on a card. A saved view keeps it.
- **They live in the address** (`?q=…&status=…&priority=…&person=…&label=…&type=…&due=…`), so a
  pasted link opens the page filtered the same way.
- **Field columns.** Filtered to one task type, the List's Columns menu adds
  up to 3 of that type's fields as columns (see [Task types](task-types.md)).
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

On the project page and My dashboard a task opens in the right panel,
beside the Board or My tasks (Tyler, 13 Oct 2026, from his drawing). On My
dashboard it takes the inbox's place, and closing it brings the inbox back.
Neither puts a window over the page.

- **The task panel.** Along the top: the status as a pill with
  its dot, "Add note" (only while the task has no notes), the paperclip with
  the number of files, the chat icon (only while the chat has no messages),
  the cog, and a cross at the far right that closes the task. In a narrow
  panel Add note keeps its pencil and drops its words. Follow is in the
  cog's dropdown (Tyler, 14 Oct 2026). Down the panel: anything that needs an answer (a
  hand-over to accept, a review, the Stuck reason row, the Move and Remind
  me cards), then Notes once the task has some, Steps ("Steps · 0 of 2
  done") and Chat ("Chat · 4") once it has a message, each a card that folds shut and stays shut
  in this browser. The task's title is the panel's first line, in bold
  (Tyler, 14 Oct 2026, `assets/pasted-image-1792006071437749000.png`).
  Clicking it edits it in place: Enter or clicking away saves it, and an
  empty title is refused and put back. It left the cog's Details tab, so
  the title is edited in one place. An archived project's title can't be
  edited. The open card is outlined on the Board.
- **The panel's header buttons have no border or background**, the status
  included, so the status, Add note, the paperclip, the chat icon and the
  cog are plain until pointed at (Tyler, 14 Oct 2026).
- **A card's arrow and cog show only while it is pointed at**, folded or
  open (Tyler, 14 Oct 2026, `assets/pasted-image-1791995305794293000.png`).
  The cog has no background. Clicking it, and only it, opens the card's
  footer, a row of its buttons under a line: Notes has Edit notes (a pencil)
  at the left and Earlier versions at the right; Steps has Add a step list
  and Save these steps as a list. On a folded card the cog opens the card
  with its footer showing. The cog stays while its footer is open, so it can
  close it again. Chat has no buttons, so only its arrow. Moving onto a card
  with the keyboard shows them too, and a screen with no pointer always
  shows them (`src/components/project/panel-card.tsx`).
- **Add note** opens a dropdown under the button with the editor ready
  (Tyler, 13 Oct 2026). Done saves, and only then does the Notes card appear
  in the panel, as it shows from then on. Closed with nothing typed, nothing
  appears. Typing and then clicking away saves too, so nothing written is
  lost. The dropdown opens leftward from the button, 16px clear of the
  window's edge. The editor opens with a cursor at the end of the note, so
  the formatting bar shows only once words are selected. While notes are being written,
  Done sits at the right of the Notes card's footer whatever the cog says,
  under the notes, so the formatting bar over the first line never covers
  it.
- **The paperclip** opens a dropdown under it (Tyler, 14 Oct 2026; it was a
  window) with "1 file", the limit, the task's files and the place to drop
  more.
- **The chat icon** works like Add note (Tyler, 14 Oct 2026): while the chat
  has no messages, it opens a dropdown with the box to write the first one,
  and once one is sent the Chat card appears and the icon goes. A deleted
  message doesn't count, so a chat holding only "Message deleted" still has
  the icon, shows the deleted line in the dropdown, and counts 0.
- **The cog** opens a dropdown, as Tyler drew it on 13 Oct 2026
  (`assets/pasted-image-1791937217887403000.png`). Follow (or Following) sits
  at the right of its Details and History tabs (Tyler, 14 Oct 2026,
  `assets/pasted-image-1791997051267604000.png`). Its Details tab is a stack
  of cards that fold open (Tyler, 14 Oct 2026, from Trade's order window and
  the Broadcast dashboard's settings, `assets/pasted-image-1792015687885493000.png`
  and `assets/pasted-image-1792016136552647000.png`). Shut, a card shows its
  name and its answer on the right with an arrow; open, a line saying what
  it is for and its fields one per row. Person ("Admin", or "· waiting")
  holds Assigned to, the hand-over note and Hand back; Dates ("Oct 14 to Oct
  23") holds Start day, Due date and Due by; Priority and type ("Normal ·
  Video editing · 2 labels") holds Priority, Type, Section and Labels; Needs
  review is a tick box with nothing to open; then the task type's own fields
  ("3 fields"), and Plan ("Repeats · Reminder set", or "Nothing set") with
  repeat, snooze, waiting on and my reminder. Each card starts shut and
  remembers in this browser whether it was left open
  (`src/components/project/option-card.tsx`). The dropdown is 384px wide. Then
  Duplicate task, Move to project, Remind me and Delete task. Its
  History tab holds the task's history. Every field saves on its own, and
  closing the dropdown saves the field being typed in. Move to project and
  Remind me were not in the drawing; they are kept there because nothing
  else on the page reaches them.
- **Opening another task** while one is open swaps it in place, with no new
  step in the browser's history, so the cross returns to the list rather
  than to the task before.
- **The cross, and the browser's own back button,** close the task.
  Opening a task from the list adds a step to the browser's history, and
  the cross takes that step back. A task that arrived by link closes without
  leaving the page.
- **A link to a task still opens it.** The address is `?task=<id>`, so a
  pasted link or a bell notice opens the task on its project page.
- **Narrow screens.** Below 1280px both pages switch to their Task tab when
  a task opens, and back to the task list's tab when it closes.
- **A task that's gone** shows "That task is gone or you can't see it." with
  Close, which takes `?task` out of the address. There's no Try again and no
  red message, since trying again can't bring it back.
- **The Team dashboard and the check-in keep the window.** Their middle panel
  isn't a task list, so a task opens there as a window over the page. Tyler
  chose this on 10 Oct 2026.
- **This is the one exception to the template's rule** that a record opens as
  a window over its list. It is Project's choice on purpose, for tasks only.
- **The same task every way.** The window and the right panel draw the same
  fields from one file
  (`src/components/project/task-body.tsx`), placed differently.

## Tasks

- **What a task holds.** Title, formatted notes, project, the person assigned,
  who handed it out, due date, status, priority, optional steps, files, a
  chat, the people following it, and an optional task type with that type's
  fields.
  The chat, following, notes and files are in [Task chat](task-chat.md), and
  types and their fields in [Task types](task-types.md).
- **Four statuses.** To do, Doing, Done and Stuck.
- **Stuck needs a reason.** Marking a task Stuck asks for one line. The reason
  shows on the task until it leaves Stuck. Whoever handed the task out gets a
  bell notice, or whoever made it when nobody handed it out.
- **Priority.** High, Normal or Low, beside the due date in the task. Every
  task starts Normal, old ones included. High gets an "↑ High" mark on Board
  cards and List rows; Low draws the task's title faintly with a small "Low",
  so people use it and High keeps meaning something. The List tab and My
  tasks have a Priority column that sorts High first, and a Priority filter
  (`?priority=high`) that saved views keep. The check-in's pick list puts High
  first within each project. Duplicate, Copy project and repeat copies keep
  it.
- **Steps.** Up to 50 per task. Progress reads as "3 of 5 steps done". Tyler
  chose steps over a percentage because a percentage is a guess.
- **Saved step lists.** Under a task's steps, "Save these steps as a list"
  keeps them under a name, such as "Payroll", and "Add a step list" drops a
  saved list in after the steps already there. Lists belong to the team:
  anyone on it makes or uses one, and the site admin renames and deletes
  them in Team settings (Tyler's choice, 12 Oct 2026). Steps added from a
  list start unticked, with no person and no date. A list that would take a
  task past 50 steps is refused whole: "That list has 6 steps and this task
  has room for 2 more, since a task can have at most 50." Names are unique in
  the team whatever their capitals, up to 60 characters, and a team keeps at
  most 100 lists.
- **Due dates** are whole days. A task past its due date and not Done shows
  "Overdue". Wherever a task's due date is picked (the task, New task and the
  bulk bar's "Pick a date…") four buttons sit above the month: Today,
  Tomorrow, Next Monday and In a week, each with its day. They count from the
  person's own today, in their own time zone. Tomorrow and Next Monday skip
  the team's days off and holidays, so Tomorrow on a Friday is Monday, and
  Next Monday on a Monday is the Monday after. In a week is 7 days on,
  whatever day that is. If the team's days can't be read, the month still
  works without the buttons (`src/lib/project/quick-days.ts`).
- **A due date can have a time** ("Due by" in the task, beside Due date,
  shown once the task has a date). It is the moment the task is due by, such
  as 3:00 PM, saved as `due_at` beside the day (`drizzle/0114_project_due_time.sql`).
  It saves when the field is left or Enter is pressed, and Clear makes the
  task due all day again.
  - **Each person reads it on their own clock.** Board cards, List rows, My
    tasks, the check-in and a teammate's page show "Mar 2 by 11:00 AM", with
    the day and time the moment falls on for the reader. Someone far enough
    away can see the day before or after the stored date.
  - **Overdue from the time** (Tyler's choice, 13 Oct 2026). The task reads
    "Overdue" and moves into My tasks' Overdue group once the moment passes.
    The "Due tomorrow" and "Overdue" bell notices don't change: they still go
    out in the morning, by day, so nobody gets a notice in the middle of the
    day. The Team dashboard's Needs attention and Workload, the Calendar and
    Timeline tabs, and the team's due dates also still go by day.
  - **A new day without a time is due all day.** Changing the date from the
    task, a quick day, the bulk bar or by dragging on the Calendar or
    Timeline clears the time, and so does clearing the date. Duplicate keeps
    the time. Copy project and repeat copies start without one, as their
    days are new. A time can't be set on a task with no due date, and has to
    fall within a day of the date: "Pick a due date first, then the time
    it's due by." New task has no time field; add the time in the task.
- **"Date moved 3 times"** shows beside the due date of a task not Done
  whose date has moved from one day to another 3 or more times, on the task,
  Board cards and List rows. Setting a first date or clearing one isn't a
  move, and the mark goes when the task is Done. Each move is in the task's
  History (see [History](history.md)). A date this year reads "Nov 30", and the year shows only for
  another year ("Jan 4, 2027"); snooze dates and time off read the same way.
  History lists each moment as "Fri, Oct 10, 3:04 PM".

### Making tasks quickly

- **A task type** can be picked in New task, which then fills the type's
  starting steps and notes and asks for its fields that are needed when made
  (see [Task types](task-types.md)).
- **New task opens a dropdown**, not a window (Tyler, 14 Oct 2026): the
  title, who it is for (me, when I'm on the project) and a due date. Enter or
  Create task makes it, with the project's own type and that type's steps
  and notes. "More options" opens the full New task window with what was
  typed. So does a type that needs fields filled in when it is made (the
  dropdown says so and its button reads Continue), and so does pasting
  several lines. Clicking away keeps what was typed for the next opening.
- **New task in the header**, on every page. It opens the same dropdown with
  a Project picker. On a project's page it starts on that
  project; anywhere else, or on an archived project, on the last project used
  (remembered in this browser, also by the project page's own New task). The page under it stays as it is. On a phone
  it folds into the header's three-dot menu.
- **Paste a list.** Pasting more than one line into a new task's title asks
  "Make 8 tasks, one per line?". Yes makes them all in the chosen project,
  each with the person and due date picked in the window. Blank lines and
  bullet marks (-, *, •, 1., [ ]) are left out. At most 50 at once; more is
  refused with the reason and nothing is made. "No, make one task" joins the
  lines into one title instead. Pasted tasks are made without a type (Tyler's
  choice, 11 Oct 2026), and the window says "Pick their type one by one."
- **Duplicate**, from the task's "More" menu, makes "<title> (copy)" in the
  same project and section, with its notes, labels, steps (unticked), type
  and field values, To do and nobody assigned. The chat, history and files
  stay with the original, so a File field starts empty.
  The copy opens straight away.

### Changing tasks

- **Many at once.** With Mass select on, ticking rows on a project's List tab
  puts a "3 selected" button in the header, left of All time, with a rainbow
  running round its edge so the eye finds it (Tyler, 19 Oct 2026; it holds
  still when the device asks for less motion). Its dropdown holds Mark Done,
  Status, Hand to (with one optional note for all of them), Due date and Move
  to project, each of the last four stepping into its own list with a back
  arrow, then Clear selection. Due date offers No due date, the quick days and
  the month. Escape on a list goes back to the first one; Escape there
  closes the menu. My tasks keeps these as a row of pickers beside Mark Done. Mark Done reports the same way as the rest, naming each
  refused task with its reason, such as "Fill in Final cut first." My tasks has the same bar without Move to project. Stuck asks for one reason
  for all of them ("Why is it stuck?" for one task, "Why are they stuck?" for
  more). Each task is changed on its own, as if alone, so each still writes
  its history and sends its notices, and one that can't be changed is refused
  alone. The result says "5 tasks changed, 1 refused." naming up to three
  refused tasks with their reasons, and "2 tasks unassigned." when handed to
  Nobody.
- **Pick a date…** in the bulk Due date opens the calendar at once. Escape or
  a click outside brings the menu back.
- **Stuck says so, wherever it's set.** "Marked Stuck." from the task and from
  a Board drag. To do, Doing and Done stay quiet, since a toast on every drag
  would be noise.
- **The List waits for the last save.** While a reorder or status change is
  saving, rows can't be dragged, so two quick drags save in the order made.
- **Move to project**, from the "More" menu, opens a card at the top of the
  task, never a second window, with my other open projects, Move task and
  Cancel. Escape cancels the card before it closes the task's window. Greyed
  out, it says "You're not on any other project." If
  the person assigned isn't on the new one, the card says so and the task
  moves with nobody assigned (and their name kept). Steps, chat, files,
  labels, type, field values and history go with it; the section stays
  behind, since sections are one project's own. People on its steps who
  aren't on the new project come off them, and so does a Person field naming
  them. When the new project doesn't offer the task's type, the card says so
  and the task keeps it. Past check-in lines keep the old project, because that's where
  the task was that day. On the old project's page, the page follows the task
  to its new one.
- **Make it a task.** A step that grew too big becomes its own task in the
  same project, from the step's own menu, with the step's text, person and
  date. The step leaves the old task, and both histories link to each other.
- **Delete step** asks first inside the step's menu ("Delete this step?" with
  Keep it), and says "Step deleted." The step's person, date and Clear wait
  while a change to the task is saving.

### Planning ahead

Each task has a Plan card with three fields that save the moment they change.

- **Repeat.** Every work day, every week on chosen days, every 2 weeks on
  chosen days, every month on a date, every 3 months from a first date, or
  the last work day of each month. See [Repeating tasks](repeating-tasks.md).
- **Snooze until** a date. Until the person's own morning of that date, the
  task is left out of their check-in's pick list and My tasks' Open tab
  ("1 snoozed task is hidden until its day"). The project page still shows it,
  with "Snoozed until Dec 1", so whoever handed it out still sees it. "Wake it
  now" ends the snooze. A task left over from yesterday's check-in still has
  to be carried over or dropped with a reason: snoozing never answers for it.
- **Waiting on** up to 10 other tasks in the team, each picked by searching
  titles, with "Add another task" for the next. The search leaves out tasks
  it already waits on, says Searching… while it looks, offers Try again when
  it fails, and says "No tasks match." only for a real empty result. The Plan
  card lists them, each with an hourglass or a tick for Done and an X to take
  it off. A card reads "Waiting on: Get the logo approved" while one is still
  open and "Waiting on 2 tasks" while more are, and each of the others shows
  "Holding up: Launch the site". Once every one is Done, the waiting task
  shows "Ready to start" and its person gets "Anna finished what your task
  was waiting on", once, as the last one is finished. One in the bin doesn't
  hold it up. A task can't wait on itself or on anything already waiting on
  it, however far down the line. A task in a project the reader isn't on
  reads "1 task in another project", never its title; a card names it only
  when both are in the same project. Links made before 12 Oct 2026, when a
  task could wait on one task, read as a list of one.
- **Remind me**, from the task's More menu, picks a day for the person's own
  reminder. On that day, at their own check-in time, the bell says
  "Reminder: Write the About page" with the project's name under it, and
  opens the task. Each person has at most one per task, and picking a new day
  replaces it (Tyler's choice, 12 Oct 2026). Nobody else sees it. The Plan
  card says "Reminding you on Thu, Oct 16, at your check-in time." with Take
  it off. It is sent once, on any day, work day or not, and a day missed
  while the server was down is sent on its next pass. A task in the bin, or
  one the person can no longer see, sends nothing and the reminder goes.
  Leaving the team takes a person's reminders off. The bell is the only
  reminder, as Tyler ruled.

### Just me tasks

- **A task can be "Just me"**, picked as the project in New task or in the
  check-in's "Add a task for yourself". Only that person and the site admin
  see it (Tyler, 16 Oct 2026: "Tyler sees private things too"). It shows on
  their My dashboard and in their check-in. The site admin finds each
  person's list on Projects as "Just me · Ben Tester", and has no list of
  their own.
- **On the Team dashboard** it reads "1 personal task", never its title, for
  everyone.
- **They live in a project of the person's own**, made the first time they
  use it, which never shows on an employee's Projects page and can't be
  shared, renamed or archived. Its page (reached from a task's link) says
  only they and the site admin see it.
- **It can be moved into a project later** with Move to project (Tyler's
  choice, 10 Oct 2026), and then that project's members see it.

### The bin

- **Delete moves a task to its project's bin** for 30 days, with "Undo" on
  the message. Both ways a task opens ask the same question first: "Delete
  this task? It moves to the project's bin with its steps, chat and files,
  and can be brought back for 30 days." In a panel that's a confirm window
  (on the project page, from Delete task in the cog's dropdown); in the
  task's window it's a line in the footer, so a window never opens over a
  window. It leaves every list at once, and its history notes who
  deleted it.
- **Bin**, at the foot of the tasks panel's More menu (it sat beside New task
  until 13 Oct 2026), lists what was deleted,
  by whom and when, with Bring back. A task comes back whole: steps, chat,
  files, labels and history.
- **Who may bring it back:** the same people who may delete it, that is
  whoever made it and the site admin (Tyler's choice, 10 Oct 2026).
- **Empty bin** is for the site admin, and asks first in the Bin
  window's own footer: "Empty the bin? This can't be undone." with Keep them
  and Empty bin. Bring back spins on the row being brought back.
- **A link to a binned task** says "That task is in the project's bin. Bring
  it back from the Bin to open it." to anyone who can see the project. Anyone
  else is told only that the task is gone or they can't see it.
- **After 30 days** the daily job deletes the task for good, files first. If
  storage can't remove a file, the task stays in the bin and the job tries
  again on its next pass, so no file is left behind without its task.
- **Files in the bin still count** toward the team's 5 GB until it is
  emptied, files in a task type's File fields included.
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
  handed it out, and separately who first handed it out, which never changes
  and decides who may change a task type's brief fields and the task's type
  (see [Task types](task-types.md)).
- **Every hand-over writes history and tells the person**, whether it's one
  task, many ticked rows, a pasted list or a step made into a task.
- **Waiting.** A task handed to someone else shows Waiting until they accept
  it. Taking a task yourself skips Waiting.
- **A note with the hand-over.** An optional line, up to 200 characters,
  wherever a task is handed to someone: the task's person picker (picking
  someone else opens a "Note for Priya (optional)" line with Hand over and
  Cancel before anything changes), New task, bulk Hand to and Hand over all.
  It rides in the bell, "Anna gave you a task" over "Write the About page:
  Client wants it by Thursday", shows on the task beside Waiting until it's
  accepted, and stays in the History line. An empty note changes nothing.
  Bulk Hand to says the one note goes with every ticked task.
- **Who has room.** Each name in every hand-to picker shows "6 open", and
  "Away until Dec 4" when today falls in their time off. The count is the
  Workload tab's for the same viewer, so a member counts only their own
  projects (`loadPeopleRoom` in `team-running.ts`). Only the dates of time
  off show, never a reason. Handing to someone away is still allowed. The
  counts load when the picker's window opens; until then names show alone.
- **Accept all** on My dashboard accepts every task waiting for me, each on
  its own (see [My dashboard](my-dashboard.md)).
- **Accept or hand back.** The person it was handed to can accept it, or hand it
  back with a one-line reason. A handed-back task returns to whoever handed it
  out, with "Ben handed this back: …" on it. If that person has left the
  project, the task is left with nobody assigned.
- **Deleting** is for whoever made the task and the site admin. It moves
  the task to its project's bin (see The bin below).

## Asking for a review

So whoever hands out work can check it before it counts as finished.

- **"Needs review"** is a switch on the task, for whoever handed it out or
  made it. Whoever turns it on is the reviewer. Anyone else sees "Needs
  review: Anna checks it once it's Done."
- **When it's marked Done** the task stays Done and shows "Waiting for
  review" on the task, the Board and the lists. The reviewer gets "Priya
  finished a task for your review" instead of "marked a task Done".
- **Confirm or Send back.** The reviewer (or the site admin) confirms
  it, or sends it back to Doing with a one-line reason, and the person
  assigned gets "Anna sent a task back to you" with the reason. Both write
  history.
- **A mark on Done, never a fifth status.** Tyler's rule is four statuses. A
  task waiting for review counts as Done in progress bars and the four
  figures (Tyler's choice, 11 Oct 2026).
- **Nobody to review it confirms itself**: when the reviewer marks it Done
  themselves, or has left the project, it just stays Done. Turning the switch
  off while it waits does the same.
- **Where it lives:** `needs_review`, `reviewer_user_id` and
  `review_waiting_since` on `project_tasks`, rules in
  `src/server/project/task-review.ts`.

## Thanks

- **A Thanks button on a Done task**, for anyone who can see it but the
  person who did it. They get "Maya thanked you for a task" with its title.
- **One thanks per person per task.** After it, the task says "You thanked
  Priya." Thanking yourself isn't offered.
- **The Check-ins tab** shows each day's thanks in one small line per person
  (see [Teams and invites](teams-and-invites.md#thanks-on-the-check-ins-tab)).
- **No counts and no leaderboard.** It's a small touch, never a score.
- **Where it lives:** `project_task_thanks`,
  `src/server/project/task-thanks.ts`.

## Doing per person

- **An optional limit in Project settings**, "Doing per person", from 1 to
  99. Empty means no limit.
- **Over it, the Board's Doing column says so**: "Leo has 4 in Doing (limit
  3)" under its heading, with a warning mark. Grouped by person, the line
  sits in Leo's own row. It counts every task on the
  project, whatever the filters show.
- **It only warns.** Nothing is blocked, or it would get in the way of real
  work. No limit, no lines (`src/lib/project/doing-limit.ts`).

## Bell notices

Thirteen notices about a task, each opening it in the right panel of its
project page:

- **"Anna gave you a task"** when a task is handed to you.
- **"Ben handed a task back to you"** with the reason.
- **"Ben marked a task Stuck"** with the reason.
- **"Ben unblocked a task"** when it leaves Stuck for To do or Doing.
- **"Ben marked a task Done"** once, when it becomes Done.
- **"Anna commented on a task"** to the person assigned, whoever handed it
  out, whoever made it, the task's followers, and whoever the message replies
  to.
- **"Anna asked you about a task"** to each person tagged with @ in the chat.
- **"Anna gave you a step"** to the person a step is given to.
- **"Anna finished what your task was waiting on"** to the person on a task
  that was Waiting on the one just marked Done.
- **"Priya finished a task for your review"** to the reviewer of a task that
  needs review.
- **"Anna sent a task back to you"** with the reason, when a review sends it
  back.
- **"Maya thanked you for a task"** to the person who did it.
- **"Anna gave you 3 tasks"**, the same notice as Hand over all, to a new
  member for their starter tasks.

Stuck, unblocked and Done go to whoever handed the task out, or whoever made
it when nobody did, to the task's followers, and to the project's lead. That way the person who hands
work out hears when it's finished or moving again without asking. Marking
several rows Done sends one notice per task.

Two come from teammates about the check-in rather than a task, and open the
Team dashboard on that day: **"Maya answered your blocker"** and **"Leo
mentioned you in their check-in"** (see
[The morning check-in](morning-check-in.md)).

Two come from a project's chat and open it on its Chat tab: **"Anna tagged
you in a project chat"** and **"Anna replied to you in a project chat"** (see
The project's chat above). One comes from the team: **"Maya posted an
announcement"** to everyone on the team, which opens the Team dashboard (see
[Teams and invites](teams-and-invites.md#the-teams-announcement)). A reaction
sends no notice.

Four more come from the app itself, with nobody as the sender:

- **"Due tomorrow"** with the task's title, to the person assigned, at their
  own check-in time on the work day before the due date. When the next work
  day is after a weekend it names the day: a task due Monday says "Due Monday"
  on Friday.
- **"Overdue"** with the title, at their check-in time on the first work day
  after the date passed. Dates more than a week gone don't send one, so
  turning this on didn't flood anyone's bell with old dates.
- **"5 of 6 checked in, 1 blocked"** to the site admin, once per work
  day (see [The morning check-in](morning-check-in.md)).
- **"Reminder: Write the About page"** to whoever set Remind me on that task,
  on the day they picked (see Planning ahead above).

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

### Switching a kind off

Each person picks which kinds reach their bell, in **My notices** on
[My dashboard](my-dashboard.md#left-me). Tyler's choices on 12 Oct 2026:

- **A kind switched off is never sent to that person.** Everyone else still
  gets theirs. The app checks the switches as it writes each notice, so the
  shell's bell, and its site-wide switch for app admins, are untouched.
- **Three kinds always arrive and aren't listed:** "Time to check in", a
  person's own "Reminder: …", and tags ("asked you about a task", "tagged you
  in a project chat", "mentioned you in their check-in").
- **Every other kind has a switch**, "Due tomorrow" and "Overdue" included.
  "Gave you a task" also covers "gave you 3 tasks". The morning summary and
  "joined the team through the link" go only to the site admin, so only
  they see those two switches.
- **Everything starts on.** Only switched-off kinds are saved, one row each
  in `project_notices_off`. Reminders a switched-off kind would have sent are
  still used up, so switching it back on never brings a pile of old ones.
- **Where it lives:** the list in `src/lib/project/notice-switches.ts`, the
  check in `withoutSwitchedOff` in `src/server/project/notices.ts`, and the
  saving in `src/server/project/notice-switches.ts`.

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
Projects, Team and Task types to the members' menu and to each admin menu.

- **Each menu gets the section once.** The job writes down which menus it has
  done in `project_navigation_added`. An admin who later removes a link in
  Settings keeps it removed.
- **My dashboard left the admins' menus** on 16 Oct 2026 (Tyler: "remove my
  dashboard from my menu"), by a pass of its own
  (`workspace:<id>:no-my-dashboard`). The site admin has no tasks or
  check-in, so the page only forwarded them to Team. The members' menu and
  the employee menu keep it.
- **A link added later gets its own pass.** Task types (12 Oct 2026) went
  after Team in menus that already had the section, once each, with a marker
  of its own (`members:task-types`, `workspace:<id>:task-types`). A menu
  whose admin removed the whole Work section stays without it.
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
  Activity tab's kinds in `drizzle/0102_project_projects.sql`, and priority,
  the newer repeats, `project_task_waits`, the due-date move kind,
  `project_task_reminders` and `project_step_lists` in
  `drizzle/0111_project_planning_tasks.sql`, described to the code in
  `src/server/project/schema.ts`. A task's `start_date` is in
  `drizzle/0113_project_nine_features.sql`. A project's status, lead,
  client and "Everyone on the team", milestones, project events and
  templates are in `drizzle/0117_project_more_for_projects.sql`. The old single `waiting_on_task_id`
  column is still in the database, unread, until the move to
  `project_task_waits` is proven on the live database; a later migration
  drops it.
- **Search and saved views:** `src/server/project/search.ts` and
  `saved-views.ts`, the table `project_saved_views` and the search's
  indexes in `drizzle/0110_project_finding_and_seeing.sql`, endpoints in
  `src/lib/api/project/finding.ts`, screens `task-search-header.tsx` and
  `saved-views.tsx`. The search's indexes need Postgres's `pg_trgm`; where
  it can't be loaded (the in-memory test database) the search runs without
  them and gives the same answers.
- **Rules:** `src/server/project/projects.ts` and `src/server/project/tasks.ts`,
  with the chat, followers and files in `task-chat.ts`, `task-followers.ts` and
  `task-files.ts` beside them, and pasting, duplicating, moving, bulk changes
  and Make it a task in `task-changes.ts`, and repeat, waiting and the bin in
  `planning.ts`, with its jobs in `planning-jobs.ts` and "Just me" in
  `personal.ts`. Remind me is in `task-reminders.ts`, sent by
  `sendTaskReminders` in `reminder-jobs.ts`, and step lists in
  `step-lists.ts`, with their endpoints in `src/lib/api/project/planning.ts`. Copy project is in `projects.ts` and the Activity tab in
  `project-activity.ts`.
- **Endpoints:** `src/lib/api/project/`.
- **Screens:** `src/components/project/`. A task's window is `task-dialog.tsx`,
  and the right panel of the project page and My dashboard, with the cog's
  dropdown, is `task-side-panel.tsx`. The Filter popover is `task-filter-popover.tsx` and
  the header's due-date, search and members dropdowns `task-header-controls.tsx`.
  New task's dropdown is `quick-new-task.tsx`, and a task made from a Board
  column moves there through `src/lib/project/new-task-status.ts`. Project
  settings' Members card is `project-members-card.tsx`. The Board is
  `task-board.tsx`, the Calendar tab `task-calendar.tsx`, the Timeline tab
  `task-timeline.tsx` and the Files tab `project-files.tsx`.

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
