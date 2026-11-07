# My dashboard

`/dashboard`, first in the left menu, is each person's own page. Tyler asked
for it on 10 Oct 2026: three panels, me on the left, my tasks in the middle,
the open task on the right. The panels resize and collapse like the project page's.
Below 1280px wide one panel shows at a time, with My tasks, Me and Task tabs.
Switching tabs keeps each panel as it was: My tasks stays on its view, and Time
off doesn't load again. Tyler redrew all three panels on 13 Oct 2026
(`assets/pasted-image-1791938818669097000.png`); what follows is that
version.

The left and right panels share one inside spacing, 15px from the panel's
edges to its cards and between one card and the next, set in one place
(`PANEL_GUTTER`, `src/lib/project/panel-gutter.ts`). Tyler, 30 Oct 2026:
"all panels gutter needs to follow this size". The right panel is the same
task panel the project and team pages open, so it has the spacing there too,
and its footer uses the same padding so its edge lines up.

The site admin has a My dashboard of their own at the same address, with no
check-in. It is described in
[The site admin's My dashboard](#the-site-admins-my-dashboard) below.

## Left: me

- **The header** shows my photo, my name, and my job title and team
  ("Designer · Sample team"). The ⋮ beside it opens My settings (below).
- **The Daily card comes first**, above every other card, on an employee's My
  dashboard. The site admin's is a block on their own page instead (below).
  How it works is in [The Daily card](daily-card.md).
- **Under it, three cards that fold**, each remembered open or shut in this
  browser (`src/components/project/panel-card.tsx`, the shell's grey card
  with a muted note and a badge in its heading).
- **Today's check-in.** A badge in its heading: Late or On time once I've
  checked in; before that, Late once my check-in time has passed, or Away,
  Holiday or Day off. Then three rows: "Checked in 1:12 PM · due 9:00 AM"
  ("Not yet" before), "Checked out 1:12 PM" once I've checked in, and "On
  time 0 of the last 2 work days". Before checking in on a day off, holiday
  or time off, or after my time has passed, the old sentence says so under
  the rows. Under them, full-width buttons: Check in (or "Change today's
  picks"), and once checked in, Check out (or "Change check-out"). Both open
  their windows (see [The morning check-in](morning-check-in.md) and
  [The evening check-out](morning-check-in.md#the-evening-check-out)).
  Nothing reminds me to check out and nobody else sees it.
- **My check-in record** is the On time row: "18 of the last 20 work days",
  counted from my saved rows only: my last 20 work
  days, on time when I checked in by my check-in time. Days off and time off
  are saved as days off, so they're left out, and today counts once I've
  checked in. **Only I and the site admin read it**: no teammate can, and it
  never shows on the Team dashboard. The site admin sees it on my page. It's there to keep my
  own streak going, not to watch anyone.
- **My week · Oct 12 to 13**: "Checked in on 4 of 5 work days" with the
  arrows beside it and a bar filling the same share, then Finished, Carried
  over and Dropped as rows with a count or "None", each task listed under its
  row (a drop with its reason). Arrows step back a week at a time, up to 12
  weeks. It reads only my saved
  check-in rows: a pick counts as finished when its day ended Done, or is
  Done now on a day still going on, and each task shows once. Today counts as
  a work day once I've checked in, and a check-in on a day off doesn't count,
  so it never reads "5 of 4". **Only I and the site admin read it**: it says
  "Only you and the site admin see this." (`src/server/project/my-week.ts`,
  `my-week-card.tsx`). Tyler left out
  the weekly manager email; the check-in isn't for watching people.
- **Time off**: my days off coming up, with Add time off (a first and last
  day) and a bin button that asks before taking one off. With none coming
  up, "No time off coming up." and a small Add share one line. The days off
  load with the page, so folding the card and opening it again shows them at
  once instead of flashing "Loading time off…" (Tyler, 14 Oct 2026). See Time
  off in [The morning check-in](morning-check-in.md#time-off).
- **My settings** opens from the ⋮ in the header (Tyler, 6 Nov 2026: "it needs
  to be replaced with a 3 vertical icon ... It uses tabs"). It is a dropdown
  22.7rem wide at most, with underlined tabs from the left, 32px apart, and
  each tab scrolling inside it. It opens on General every time. There is no
  email line ("Remove email and dividers"). The frame is
  `my-settings-menu.tsx`, shared with the site admin's.
  - **Every list in it is light grey,** with a row going a shade darker while
    it is pointed at (Tyler, 6 Nov 2026: "The project app settings white bg
    needs to be change to light gray too"). That is General's rows, each
    Notifications group, and the Daily card's Card layout and habits, where
    a habit's icon sits on a white tile so it still stands out.
  - **General** is grouped rows, as the task's ⋮ is (Tyler, 6 Nov 2026:
    "general should have the same grouping ui design too"): a grey heading
    over a bordered list, each row its name and value. **You:** Job title and
    Check-in time. **Daily card:** City for the weather and Your hours (when
    morning, afternoon and night start), which the Daily card's pencil window
    held until that day. Each opens a small box with its field, since each is
    typed. The pencil is gone.
  - **Notifications:** the bell notices (below).
- **My check-in time** (in My settings → General): my own time and time zone, saved on change.
- **My notices** (in My settings → Notifications): a switch for each kind of
  bell notice, under small headings, each group in one bordered list: Tasks,
  Time requests, Dates and The team (Tyler's drawing of the tab, 6 Nov 2026). A switch saves the moment it flips, and a
  refused save flips it back. A kind switched off is never sent to me, and
  everyone else still gets theirs. "Time to check in", my own reminders and
  tags always arrive, so they aren't listed. **Only I see or change mine.**
  The rules are in
  [Projects and tasks](projects-and-tasks.md#switching-a-kind-off)
  (`my-notice-switches.tsx`).
- **Job title**, **My check-in time** and **My notices** each say Saving…,
  then Saved or Not saved, beside the field. See
  [Fields that save themselves](fields-that-save-themselves.md).

## Middle: my tasks

The header is the project page's (Tyler, 14 Oct 2026): the same four views,
List, Board, Calendar and Timeline, as tabs drawn the way Settings → Styling →
Dashboard tabs says (pills unless the site picked Underlined), then Filter,
Views, New task and a ⋮. The ⋮ holds Search tasks and, on the site admin's
List, Mass select (Tyler, 6 Nov 2026: "Add the 3 dot icon here and move mass
select and search under its dropdown"). This parts from the shell's toolbar
order, where search and Mass select sit in the header itself. List is first since 19 Oct 2026,
as on the project page. New task
opens the same dropdown as the signed-in header's, with a Project picker
starting on the last project used. There is no members dropdown, since every
task here is mine. Under 896px wide the dropdowns drop their words for their
icons, under 768px New task shows only its plus, and narrower still the tabs
scroll sideways. The view last used is remembered in this browser. They
replaced the Today, Open and Done tabs the same day, by Tyler's choice.

- **Board**: my tasks in the four status columns, each card naming its
  project. Dragging a card to another column changes its status, the same as
  on the task, and Stuck asks why first. Cards sort by due date, soonest
  first, and don't drag up or down, since they come from several projects
  (Tyler's choice). The columns drag left or right by their heading into my
  own order, which only I see and which lasts after a reload; it is mine, not
  any project's (`project_team_members.my_status_order`, migration 0116).
- **Calendar** and **Timeline**: the project page's, with my tasks. The
  Timeline groups rows under each project when there is more than one.
  Moving a date is the same save as on the task.
- **List**: the rows below.

Snoozed tasks stay out of every view until their day. An archived project's
tasks leave My dashboard with it and come back if it is brought back (Tyler,
14 Oct 2026), as they already left the check-in: nothing in an archived
project can change, so they could only be refused. On the List a task is
one row (`src/components/project/my-task-rows.tsx`): a round tick box, the
title with the project and its chips under it (High, "Date
moved 5 times", "Waiting on 1 task", "3 new"), then the due date ("Overdue ·
Oct 12" in red), the status with its dot, and an arrow.
On a phone the date gives way. Group headings are small capitals
with a dot: OVERDUE red, TODAY orange, TOMORROW teal, THIS WEEK blue, LATER
purple, NO DATE grey, and WAITING FOR MY ANSWER yellow. Under each group the rows come in
my own order (below), then any I haven't placed, soonest first.

- **Picked for today** comes first: what I picked on today's check-in, in my
  own order, from the check-in. Those rows drag up and down to set that
  order, and never leave the group. Dragging is off while a search or filter is
  on. A picked task shows only here, not again under its due date.
- **Then every other open task of mine**, split into Waiting for my answer,
  Overdue, Today, **Tomorrow** (Tyler, 2 Nov 2026: "Add a tomorrow sort
  under today"), This week (the six days after tomorrow), Later and No date,
  then **Done** last, each with its count. Today, Tomorrow, This week, Later,
  No date and Done show even when empty, so a task can be dragged into them; the other
  empty groups are hidden. On the site admin's table those empty ones show
  only while Mass select is on, since only then can a row be dragged (Tyler,
  24 Oct 2026: "when mass select is off. Hide the empty sections"). **Accept all 9 tasks**
  sits beside "9 tasks are waiting for you…", on a grey line: each is accepted on its own, so
  each writes its history line, and the result says "9 accepted", or names one
  that changed hands since with the reason. "Today" is my own day,
  in my time zone, the same day the check-in uses.
- **A heading's "+"**, as on a project's List (Tyler, 24 Oct 2026: "My
  dashboard is missing the "+" icon in the section like project dashboard").
  It shows while the heading is pointed at and opens New task with the
  Project picker, on the employee's List and the site admin's table alike.
  The task starts where a drop under that heading would leave it: Today due
  today, Tomorrow due tomorrow, This week the day after tomorrow, Later eight days on, No date with no date, Done
  as Done. Waiting, Overdue and Picked for today have no "+", since a new task
  can't start there (`addUnder` in `my-tasks-panel.tsx`).
- **A heading's arrow** beside the "+" folds that heading shut, and the same
  arrow, pointing right, opens it again (Tyler, 24 Oct 2026: "beside the +
  icon, there should be a arrow collapse icon to collapse the section too").
  The arrow shows only while the heading is pointed at, folded too (Tyler,
  28 Oct 2026: "this icon should only appear on hover",
  `assets/pasted-image-1793203487769342000.png`); a phone always shows it.
  One click anywhere on the heading folds or opens it ("Make section one
  click to uncollapsed"); a click on the "+" or the arrow does only that.
  The count stays in view. This browser remembers which headings are folded
  (Tyler, the same day: "the collapse doesnt remember"), one set for My
  dashboard, shared by the employee's List and the site admin's table.
  Project Lists have the same arrow. A folded heading at the bottom of a
  List keeps its lines above and below (Tyler, 28 Oct 2026: "bottom section
  is missing border", then "missing top borader"), and two folded headings
  share the one line between them. All of them come from the shell's one
  table line rule; the List draws none of its own, since its own sat beside
  the shell's and read as a thick line (30 Oct 2026: "when collapsed the
  border is too thick").
- **Filter's Group row** (Tyler, 31 Oct 2026: "my dashboard is missing
  "Group" function in filter"), on the List tab, for employees and the site
  admin alike. It starts on **My headings**, the groups above. The other
  choices are the project List's (Status, Priority, Due date, Assigned
  to) plus **Project**, since these tasks come from many projects. Group by
  Template went when task templates and their fields were removed on 6 Nov
  2026 (Tyler: "We need to remove the tasks templates feature too").
  Tyler picked keeping My headings as the start. Under any other choice the
  same rows sit under that choice's headings. With Mass select on, a row dragged under another heading takes
  that heading's value, as on a project's List (Tyler, 6 Nov 2026: "mass
  select does not have draggability"): a status (Stuck asks why first), a
  priority or a due date.
  These groupings keep no order of their own, so a drop inside its own
  heading does nothing. Under Assigned to and Project rows don't drag, since a
  drop would hand the task over or move it to another project.
  Every heading keeps its "+" (Tyler, 31 Oct 2026: "still no + icon"): under
  Due date it starts the task as My headings' would, under Status in that
  status, under Project in that project, under Priority at that priority
  ("If I click on + in high priority then high priority should be
  selected"), and under the rest as a plain new task. This browser remembers the choice,
  and each grouping remembers its own folded headings. A saved view doesn't
  keep it (`MY_GROUPINGS` in `lib/project/task-groups.ts`).
- **Dragging rows** (Tyler, 23 Oct 2026: "I want to be able to drag and drop
  tasks into different order and sections"). On an employee's List any row
  can be grabbed and dragged, and a plain click still opens it. On the site
  admin's table, rows drag by the handle that shows once **Mass select** is
  pressed, as on a project's List (Tyler, 24 Oct 2026: "bring back the old
  pattern of pressing mass select to move").
  - **Up or down inside its group**, it sets my own order there, which only
    I see and which lasts after a reload. Teammates and the project page keep
    theirs (`project_my_task_order`, migration 0132).
  - **Under another group**, it takes that group's date: Today is due today,
    Tomorrow tomorrow, This week the day after tomorrow (the first day
    Tomorrow doesn't hold, so the row stays where it was dropped), Later
    eight days from today, No date clears the date,
    and Done marks it Done. It is the same save as the Due cell or the Done
    tick, so it loses any "Due by" time, counts toward "Date moved 3 times",
    and a Done the server refuses is put back with the reason.
  - **Overdue and Waiting for my answer take no drops**, and rows under
    Waiting, Done and Picked for today stay in their group, since their date
    would not move them.
  - **The rows slide apart to make room** (Tyler, 24 Oct 2026: "why cant we
    use the old drag and drop animation and still keep sections in place?").
    While a row is held, a small copy with its status dot and title follows
    the pointer, and the row's own place shows faded in a gap that opens
    where it will land, in its own group or in another that takes it. Over
    an empty group's heading, the gap opens under it. A group that takes no
    drops never opens a gap, and Escape puts everything back. The headings
    stay put: only the groups the row leaves and enters change by one row.
  - **A task that arrives some other way** (someone changes its date, a new
    task, the day rolls over) goes to the bottom of its group, and my order
    above it stays. A place counts only under the group it was set in.
  - **Off while a search or filter is on**, since hidden rows would make the
    place a guess, and while a change is saving. On the site admin's table,
    sorting by a column turns it off too, with a "Use my order" button back.
  - The rules are `src/lib/project/my-task-order.ts`; the save is
    `orderMyTasks` in `src/server/project/my-task-order.ts`, which takes only
    tasks assigned to me.
- **Catch up** sits at the end of a red line, "9 tasks are overdue.", above
  every view, while anything is overdue and no search or filter is on. It opens a
  window listing those tasks, the same ones as the Overdue group, all
  ticked. Untick any to keep, then pick one new due date and press "Move 7
  tasks", or press "Leave with no date". Today and Tomorrow sit on the
  date picker's line and pick in one click (Tyler, 25 Oct 2026); the picked
  one is shaded, and Move then moves to it. There is no No date button
  beside them, because "Leave with no date" in the footer does that. Tomorrow skips the team's days off. The site admin, on no
  team, gets their own time zone from My settings and Monday to Friday
  (`loadMyDays` in `src/server/project/task-reminders.ts`). It is the bulk bar's due date
  change (`changeManyTasks`), so each task is checked on its own, a refused
  one is named in the error, and every move counts toward "Date moved 3
  times" (Tyler's choice, 13 Oct 2026, so slipped work stays visible). A
  moved task loses its "Due by" time, the same as any new date
  (`src/components/project/catch-up-dialog.tsx`).
- **Done**: my finished tasks.

A task whose chat has messages I haven't read says "3 new" beside its title,
and opening it reads them (see [Task chat](task-chat.md#new-messages)).

Search tasks in the ⋮ opens the search box in the header, with the cursor in
it. The box stays open while it holds words; Escape empties and closes it. Filter holds Status, Priority, Due
and Client, then Clear and Save as view. Due is the project
page's: Any time, Overdue, Today, This week, Next week, No date. It was a
dropdown of its own in the header until Tyler moved it into Filter on
19 Oct 2026. All of
it lives in the address like the project page's, and a saved view keeps the
due date and the client (Tyler, 16 Oct 2026). Priority used to change the
address without narrowing the list; it narrows it now. Client lists the
clients of my tasks' projects, then "No client", and shows only that client's
tasks (see Clients in [Projects and tasks](projects-and-tasks.md#clients)).

My tasks keep up by themselves: a task handed to me, or changed by someone
else on a project I'm on, shows within about a second, with no reload (see
Live updates in [Task chat](task-chat.md#my-dashboard-and-the-team-dashboard)).

A tick in a round box selects the task without opening it. Ticked rows can be marked Done together, or changed with the same bar as a
project's List tab: Status, Hand to (with one optional note for them all),
Due date and Priority. There is no Move to project
here. Each task is changed on its own,
so each writes its history and sends its notices, and the result says "5
tasks changed, 1 refused." naming the refused ones with their reasons. My
tasks span projects, so Hand to refuses anyone who isn't on a task's project.

**Right-click** (Tyler, 23 Oct 2026: "My dashboard is missing right click to
add task and delete task"), as on the project page: on a task's row, card,
chip or bar it opens Duplicate and Delete (Delete only on a task I made, or
on any task for the site admin, asking first, with Undo in its message); on
empty space it opens New task at the mouse, with its project picker. A text
box, a link or picked words keep the browser's own menu.

Clicking a task opens it in the
right panel, the same panel as on the project page (Tyler, 13 Oct 2026). My
tasks stay in view, and the open task's row is shaded with a dark bar down
its left edge. Opening another task swaps it in place. On a narrow screen
opening one switches to the Task tab. The address is `?task=<id>`. How a task opens is in
[Projects and tasks](projects-and-tasks.md#opening-a-task).

## Right: the open task

The right panel always holds a task. Tyler, 23 Oct 2026: "There is no 'x'
icon to close the right panel to show an empty panel. The first load always
show the first task and then it remembers what task I'm on afterwards."

- **No cross.** Nothing closes the task; it changes when another is picked.
- **On arrival** with no task in the address, the task last open here opens
  again, or the List's first row when that task is no longer listed (done
  tasks count, since Done is listed last). A link's own task wins. The task
  is kept in this browser, per person (`src/lib/project/use-remembered-task.ts`).
  On a narrow screen a task opened this way leaves My tasks in front.
- **After deleting the open task**, or Close on "That task is gone", the
  List's first row opens, so the panel is not left empty.
- **Only with no tasks at all** does the panel show "Click a task to see its
  notes and chat here."

## Inbox

A card at the bottom of the left panel since 23 Oct 2026 (it was the right
panel's when no task was open, and Tyler picked a left card over dropping it
or a tab beside the task). It folds like the others. Its heading reads
"Inbox · 5 unread", with a double-tick **Mark all read** button beside the
arrow, then tabs: All,
Unread, Tasks (Project's own notices), Flows (an automation waiting for
approval or one that failed) and News (product updates and announcements).
A notice of any other kind, such as feedback, shows under All and Unread
only. The same notices the bell holds, newest first. It shows **6**, and
**Load more** shows 6 more, fetching the next 30 from the server once the
loaded ones run out (Tyler, 23 Oct 2026: "the inbox should have 6 open and a
button to load more"); a tab starts again at 6. Clicking
one goes where the bell would take it and marks it read. If marking it read
fails, the unread dot and the count come back and an error says so, the
same as in the bell. Mark all read marks every notice read, the bell's own
button, and says "Everything here is read." when there's nothing to mark. A
task's notice opens the task on its project page, in the right panel. The
check-in reminder opens this page with the check-in window open
(`/dashboard?checkin=true`).

## The site admin's My dashboard

Tyler, 23 Oct 2026: "I want a dashboard just for admin, but it wont work like
'my dashboard' my dashboard has things like checkin and checkout which an
admin wont need. Admin dashboard should have tasks that are assigned to me
and personal tasks. We'd also need other admin specific features". It replaced
his 16 Oct "remove my dashboard from my menu", so `/dashboard` no longer sends
the site admin to Teams, and My dashboard is first in the admins' left menu
again (a menu pass marked `:admin-my-dashboard`). His answers are in
`workspace/tasks/Admin/03-admin-dashboard.md`.

- **Three panels, the same frame.** Left: the site admin, their page (or the
  Inbox or Look back in its place), with no footer.
  Middle: their tasks, with the Need your attention tab. Right: the open task,
  with no cross. Below 1280px wide one panel at a time, with Me, My tasks and
  Task tabs. Pressing a Projects block switches to My tasks.
- **Their page, under the sky.** Under the header the whole panel is a page of
  their own, written in place with the same "/" blocks as a project's page:
  links, a callout and the rest (Tyler, 6 Nov 2026: "add the tiptap editor
  with blocks ability under the banner"; he picked one page that stays, not a
  new page each day). It saves 700ms after typing stops and when it's left.
  It is kept on `project_site_admin_prefs.notes`
  (`drizzle/0149_project_admin_page.sql`), checked by the same rule as a
  project's page, and only a site admin can save it (`setAdminPage`). An
  employee's My dashboard has none. It writes at the panel's 14px, hint and
  words alike, where a project's page writes at 15px (Tyler, 6 Nov 2026: "this
  label font is too big. should be the same size as the actual text"). The
  editor is `AdminPageNotes` in `project-page-notes.tsx`.
- **Their page's own blocks.** Typing "/" on their page offers four blocks no
  other note has: **Projects**, **Daily card**, **Rating calendar** and **Rating
  trend** (Tyler, 6 Nov 2026: "I want to create a few new blocks for left
  panel"; he picked "Your My dashboard page only"). They are described in
  [Their page's blocks](#their-pages-blocks) below. The task is
  `workspace/tasks/My dashboard/left-panel-blocks.md`.
- **No footer.** The left panel had a footer of folding cards for one day,
  6 Nov 2026: Pinned projects, Need your attention, then the whole Daily card.
  The Daily card is now a block on their page (Tyler: "make it the same as
  the habits and greeting card in the footer (and remove the footer card)"),
  so they place it where they like on the page. Until it is placed, the page
  has no greeting, Start day, habits or Rate your day.
- **Pinned projects and Need your attention left the footer** the same day. Projects blocks on the page replace Pinned
  projects (Tyler picked "Goes"), and Need your attention is a tab in My tasks
  ("I think it should be a tab here ... and show a real table",
  `assets/pasted-image-1794005413220854000.png`). Its Meetings today,
  Milestones this month, Done today and Invites not taken left My dashboard
  with it (Tyler picked "Goes entirely"). The order the Pinned projects card
  was dragged into went with the card (`drizzle/0154_project_drop_project_order.sql`).
- **The inbox icon** in the header, left of the ⋮, swaps their page for the
  Inbox, and pressed again brings the page back (Tyler, 25 Oct 2026: "add an
  inbox icon here with red bubble notification. the inbox open in that tab
  instead of card it currantly does"). A red bubble on it counts unread
  notices, "9+" past nine, and drops as they are read here. The Inbox there
  has no card or heading around it: All, Unread (with its count), Tasks,
  Flows and News are underlined tabs on the right of a low row under the
  header, with Mark all read right of them, and the rows scroll under it
  ("fix the inbox tabs too", "put the mark all as read icons on the right of
  the tabs", 30 Oct 2026; the same row as Look back's, `panel-tabs-row.tsx`).
  The Daily card's sky stays behind the header while it shows. The panel opens on their page. While the Inbox
  shows, the icon morphs into a cross (Tyler, 25 Oct 2026: "make the inbox
  morphed into an x when its in the inbox tab", then "make it morph"): the
  tray's outline folds flat into one stroke and its dip straightens into the
  other, over about a quarter of a second, and back again on the way out
  (`inbox-morph-icon.tsx`). The bubble hides while it is a cross; the cross
  brings the page back.
- **The header** shows their photo, name and "Site admin", then Look back,
  the inbox and the ⋮ for My settings. There is no cog and no pencil since 6
  Nov 2026. My settings is the employee's frame with three tabs:
  - **General:** grouped rows. **Location:** Time zone, which opens
    straight onto the zones with a search box over them, and City for the
    weather. **Daily card:** Sky, whose kinds open straight away, and with My
    own photos a Photos row for a photo per part of the day. Under the
    groups, **Lock the notes** (Unlock the notes while locked), drawn as the
    task's ⋮ draws its own: a plain row with the lock icon (Tyler, 6 Nov 2026:
    "lock the notes option is missing", then "match ui",
    `assets/pasted-image-1794010759503376000.png`). It says "Notes locked.
    Nobody can change them until they're unlocked." Locked, their page reads
    only: no "/", no bins, and the server refuses any save until
    it is unlocked, as a project's locked page does. Its blocks still show
    and still work: the Daily card's ticks, Start day and Rate your day, a
    Projects block's filter, + and arrow, and the rating blocks' arrows. It
    is kept on `project_site_admin_prefs.notes_locked`
    (`drizzle/0155_project_admin_page_lock.sql`, `setAdminPageLock`).
  - **Notifications:** the bell notice groups, plus the two only the site
    admin gets (who checked in this morning, joins through a team's link) and
    a Daily card group: "Daily routine" ("dont need these lenghty text. Just
    put "Daily routine""). Under that switch, a pill for Morning, Afternoon
    and Night. A pill that is on is solid,
    an off one dashed, and pressing one opens its own switch and time.
  - **Daily card:** Card layout and Routine habits, drawn from Tyler's picture
    of the tab. See [The Daily card](daily-card.md#in-my-settings-for-the-site-admin).
- **Their time zone.** Today, Due this week and a Projects block's days left
  count in it. Before one is saved, the first visit saves the browser's zone
  (until then the page counts in UTC). It lives on
  `project_site_admin_prefs`, beside their Board's column order, since the
  site admin has no team row to keep either on.
- **The middle** is the same My tasks as an employee's (List, Board, Calendar,
  Timeline, Filter, Views, New task, and the ⋮ with Search tasks and Mass
  select), plus a fifth tab, **Need your attention**
  ([below](#the-need-your-attention-tab)), with every open task handed to
  them in any team's projects mixed with their own list. **The List is the
  project page's table** (Tyler, 23 Oct 2026: "The tasks table have to look
  like the project's tasks table"), grouped under Overdue, Today, This week,
  Later, No date and Done, with Mass select, each cell changing its task, and
  a cog and a bin in Actions. Ticked rows gather in the "1 selected" button in
  the header, left of Filter. Mass select, from the ⋮, reads "Hide select"
  there while it is on, and leaving the List turns it off. A task's
  right-click menu has it too, first, above Duplicate and Delete (Tyler, 6
  Nov 2026: "Add mass select here on right click on tasks"); turned on from
  there, that task starts ticked. Its columns are Task, **Project**, Status,
  Priority, Due and Actions. Tyler first asked for Team and Project as their
  own columns, then had Assigned to, Steps and Team taken off ("remove the
  assigned to, steps and my team col"). The Project cell is a chip with the
  project's colour and its own name ("Just me" for their own), and picking it
  moves the task (Tyler: "I should be able to select a project in the project
  col and the text there to be in a chip form"). Every task's dropdown is the
  same ("all should be this"): **Just me** ("its missing a 'just me'
  option"), then every team's open projects under the team's name, with the
  task's own project ticked. It is the task's own Move to project, so its
  chat and files go with it, and it shows no message ("It doesnt need a toast
  confirmation"). Only a task the site admin is doing
  can go into their list; one someone else is doing stays shared. The Board, Calendar and Timeline still name the team with the
  project ("Acme · Website").
  There are no picks for today; rows drag as on an employee's List, once
  Mass select is on (Dragging rows, above). Filter offers
  a **Project** row: every open project,
  pinned or not, and every one holding a task of theirs, named with its team
  ("Sample team · Spring launch"). Pressing a Projects block on their page
  sets the same row, so the two always agree, and a saved view keeps it.
  The picked view stays picked across visits and shows its name on the Views
  button; pressing a Projects block narrows that view, and pressing it again
  goes back to the view, its own project included (see the repo's `docs/shell/three-column-dashboards.md`). Saved views are kept under their own id
  (`admin-tasks:<their id>`), so nobody else can save there.
- **Their own list is on no team.** Every list in the app belongs to a team,
  so theirs sits in a space of its own: a team row marked with their id
  (`project_teams.personal_user_id`), made the first time a task goes in "Just
  me". It has no members, and no list of teams shows it: not Teams, not the
  Projects page or its team filter, not New task off a team's page. Nobody but
  them and another site admin can open it.
- **New task** starts on the project used last; "Just me" is first in its
  list, followed by every team's projects.
- **Move to project** on a task of their own offers every team's open
  projects, named with the team ("Brand · Logo"). Once moved, the team sees
  it like any other task, and it stays theirs.
- **The right panel** is the employee page's: on arrival the task last open
  here, or the List's first row, and no cross. A task opened here asks its own
  team's questions (its people), as on its project page.
- **Live across every team.** A change to any task, project or team's
  own things, by anyone, loads the page again a moment later, so the Need
  your attention tab and the Projects blocks never go stale (Tyler, 29 Oct 2026, picking "Live across
  every team"). It is the employee page's live stream: with no team named, the
  site admin's connection listens to every team and every project
  (`watchEveryTeam` in `src/server/project/my-live.ts`). Before 29 Oct 2026
  their page only loaded with the page.

### The Need your attention tab

The fifth tab in My tasks' header, after Timeline, on the site admin's My
dashboard only (Tyler, 6 Nov 2026: "The "Need my attention" cards needs
rework. I think it should be a tab here ... and show a real table",
`assets/pasted-image-1794005413220854000.png`). It reads "Need your
attention" with how many tasks are in it. An employee has no such tab, and
one whose browser last had it open lands on the List. It replaced the Need
your attention card in the left panel's footer the same day.

- **A real table:** the site admin's List table (the project page's), with
  the same columns: Task, Project, Status, Priority, Due and Actions. Every
  cell changes its task as on the List, a row opens the task on the right,
  and a right-click has Duplicate and Delete. Search and Filter narrow it as
  they narrow the List, and Mass select is in the header's ⋮, as on the List,
  with the "3 selected" button beside the search. It has no "+" on its headings and rows don't drag,
  since a heading here is a reason, not a date.
- **Every task that needs them, across every team** (Tyler picked "Every task
  that needs you"), under six headings, top to bottom:
  - **Waiting on you:** asks for more time that fall to them: nobody else
    handed the task out, they handed it out themselves, or whoever did can no
    longer see it. The oldest ask first.
  - **No one on it:** open tasks with nobody on them, soonest due first.
  - **Stuck**, **Overdue** and **Untouched:** worked out exactly as each
    team's own Attention tab works them out
    ([Needs attention](needs-attention.md)), the longest first. These were
    the Urgent card's counts per team; here they are the tasks themselves.
  - **Due this week:** open tasks due today to six days on, soonest first,
    then High before Normal before Low.
- **Each task shows once**, under the first heading it fits: a Stuck task due
  on Wednesday is under Stuck, not Due this week. Empty headings are hidden.
  This browser remembers which headings are folded, apart from the List's.
- **Actions keep the cards' buttons.** A Waiting on you row has "Asks for Mar
  6" (who asked, the old date and their reason on hover), then **Yes** and
  **No**. Yes moves the date; No opens a box for an optional reason. Both are
  the task's own answer, with its history line and its notice. A No one on
  it row has **Hand to**, offering the project's people and the site admin,
  the same hand-over as the task's own. One save spins only its own row.
- **Empty,** it says "Nothing needs you right now."
- **Where it lives:** the rows are read by `attentionTasks` in
  `src/server/project/admin-dashboard.ts`; the tab is in `my-tasks-panel.tsx`,
  its buttons in `attention-actions.tsx`.

### Their page's blocks

Four "/" blocks only the site admin's own page offers (task
`workspace/tasks/My dashboard/left-panel-blocks.md`, Tyler, 6 Nov 2026). A
project's page, a project's notes, a task's notes and New task never offer
them, and the server drops them from any of those saves. Each has the bin
in its top corner, as every block has. They draw from what My dashboard
already loaded, so they follow its live reloads (`dashboard-blocks.tsx`).

- **Projects** (Tyler: "a new "Projects" block where I can select a project
  with the same functionality as the pinned card"). An empty block lists
  every team's open, shared projects, with a box to narrow them by name; a
  long list scrolls inside the block. Picking one draws it as the Pinned
  projects card drew each project:
  - **Top:** the project's colour as a full 36px dot, its name, and under the
    name a coloured chip ("● On track" green, "● Slowing down" amber, "●
    Behind" red) with the team's name. The due date is the chip's hover hint:
    "Due Nov 20 · 22 days left", "Due tomorrow", "Due today" or "Overdue ·
    Nov 20", counted on their own today (Tyler, 29 Oct 2026).
  - **Then** a thin green bar of how much is done, and at the bottom the lead
    first, drawn dark, then up to four people and "+3", the line of tasks
    finished each day over the last 14 days, and "5 late", "1 stuck" and
    "5/13 done" (or "No tasks yet").
  - **The whole block is tinted by how it is doing:** faint red for Behind,
    amber for Slowing down, light green for On track.
  - **Pressing it** shows only that project's tasks in My tasks, the same as
    picking it in Filter's Project row, and lifts it with a grey edge and a
    soft shadow. Pressing it again shows them all. While My tasks is
    filtered so, New task, a heading's "+" and a right-click start on that
    project (Tyler, 31 Oct 2026).
  - **Its buttons,** beside the bin while the block is pointed at (always on
    a phone): **+** for New task already on that project, and an arrow to
    the project page. It has no pin and no drag handle, since the block sits
    where it was placed on the page.
  - **A project that is archived, deleted or no longer shared** shows
    "Removed: this project is no longer open."
  - Every open project's people and finished days are read with the page, so
    a project picked a moment ago draws in full at once (`projectCardExtras`
    in `admin-dashboard.ts`; the drawing is `admin-project-cards.tsx`).
- **Daily card** ("/" then "Daily card"). The whole Daily card, exactly as
  the footer drew it until 6 Nov 2026 (Tyler: "The habits block doesnt
  really work properly. Just make it the same as the habits and greeting card
  in the footer (and remove the footer card)"; it replaced a Habit block that
  showed one picked habit). See [The Daily card](daily-card.md).
  - **What it holds:** the greeting, then Start day until the day starts,
    then the habits, Next meeting, Tomorrow at night, the Sunday look back and
    the monthly review, with Rate your day under the habits at night.
  - **How it looks:** a rounded box of solid light grey, so the sky behind
    the page never shows through it, its sections inside white ("bg white").
    Its heading is the greeting alone, with no icon before it (Tyler, 6 Nov
    2026: "remove this icon", `assets/pasted-image-1794010037256007000.png`).
    Its bin, shown while the card is pointed at, sits level with the
    greeting's first line ("align the trashcan icon"), and the greeting
    leaves room for it.
  - **Always open** (Tyler, 6 Nov 2026: "it doesnt need to be a toggle"): the
    greeting is a plain heading with no arrow. Its own sections, such as
    Tomorrow, still fold as they always have.
  - **No ring when clicked** ("why is it so ugly?",
    `assets/pasted-image-1794009881543968000.png`). Every other block shows a
    ring while it is selected, and a click on a tick or a button inside the
    card selects it, so the ring sat round the card most of the time.
  - **It is the card itself** (`DailyCard` with `boxed`), so every tick, "+",
    Start day and Rate your day saves the way the card always has.
  - **One per page:** picking it again only takes away the "/" and shows the
    one already there.
  - It holds nothing of its own. A block saved while it was a Habit block
    loses the habit it pointed at and shows the whole card.
- **Rating calendar** (Tyler's own idea: "Monthly tick habit calender view",
  then "I mean the yearly rating", `assets/pasted-image-1794005831963355000.png`,
  laid out as `assets/pasted-image-1794005758559579000.png`). One month,
  Monday first, with arrows to step back and forward and the month's name
  between them, as Look back's Month tab is. Each day's square is shaded by
  its rating from 1 to 10, as the Year tab shades them, with its date in the
  middle and its rating in the corner. A day with no rating is plain grey,
  today unrated has an outline, and days to come are faded. It only shows:
  a day is rated with Rate your day (`RatingMonth` in `daily-look-back.tsx`).
- **Rating trend** (picked from the third round). A line of their day
  ratings over the last 30 days, 1 to 10 up the side, oldest on the left,
  with "Day rating, last 30 days · 12 rated" above it. A day with no rating
  leaves a gap in the line, and with none rated it says "No day rated in the
  last 30 days. Rate your day at night." It is the shell's chart, drawn as
  the Team dashboard's trends are (`RatingTrend` in `daily-look-back.tsx`).
- **Ideas he passed on,** 6 Nov 2026: Meetings today, Team, Saved view,
  Milestones, Done today, Who's away, Check-ins today, Invites waiting,
  Finished chart, Person, Quick add, Project note, Mini calendar, Team
  activity, Announcement, Recently opened, World clock, Countdown, Live
  embed, Streaks, Habit month, Wins, On this day, Reviews, Next milestone,
  Best habit, Week ahead and Numbers.

## Where it lives

- **Reader:** `src/server/project/my-dashboard.ts`, and
  `src/server/project/admin-dashboard.ts` for the site admin's.
- **Screen:** `src/components/project/my-dashboard.tsx`, and
  `admin-dashboard.tsx` with `attention-actions.tsx`,
  `notes/dashboard-blocks.tsx`, `admin-project-cards.tsx` and
  `fold-heading.tsx` for the site admin's. Both
  share My tasks (`my-tasks-panel.tsx`) and the Inbox card (`inbox-card.tsx`),
  laid out by
  `src/components/project/three-panels.tsx`, which the project page and the
  Team dashboard share. Widths are remembered under the keys in
  `src/lib/project/panel-keys.ts`.
- **Route:** `src/routes/_authenticated/dashboard.tsx`.
- **The task in the right panel:** `src/components/project/task-side-panel.tsx`,
  shared with the project page, with the address handled by
  `src/lib/hooks/use-task-address.ts`.
