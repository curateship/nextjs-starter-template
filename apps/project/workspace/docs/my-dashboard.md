# My dashboard

`/dashboard`, first in the left menu, is each person's own page. Tyler asked
for it on 10 Oct 2026: three panels, me on the left, my tasks in the middle,
the open task on the right. The panels resize and collapse like the project page's.
Below 1280px wide one panel shows at a time, with My tasks, Me and Task tabs.
Switching tabs keeps each panel as it was: My tasks stays on its view, and Time
off doesn't load again. Tyler redrew all three panels on 13 Oct 2026
(`assets/pasted-image-1791938818669097000.png`); what follows is that
version.

The site admin has a My dashboard of their own at the same address, with no
check-in. It is described in
[The site admin's My dashboard](#the-site-admins-my-dashboard) below.

## Left: me

- **The header** shows my photo, my name, and my job title and team
  ("Designer · Sample team"). The cog beside it opens My settings, a dropdown with my email and
  the day I joined, then three rows that fold open, the same as a task's
  cog (Tyler, 14 Oct 2026; flat rows with a line between them, not boxes,
  since 20 Oct 2026): Job title ("None"), Check-in time ("9:00 AM,
  America/Toronto") and Bell notices ("All on" or "3 off"), each with its
  answer on the right while shut. The dropdown is 384px wide. Closing it saves
  the field being typed in.
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
- **My check-in time** (in My settings): my own time and time zone, saved on change.
- **My notices** (in My settings): a switch for each kind of bell notice, grouped under
  Tasks, Dates and The team. A switch saves the moment it flips, and a
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
Dashboard tabs says (pills unless the site picked Underlined), then the search as a
magnifying glass, Filter, Views and New task. List is first since 19 Oct 2026,
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
title with the project and its chips under it (High, the type, labels, "Date
moved 5 times", "Waiting on 1 task", "3 new"), then the due date ("Overdue ·
Oct 12" in red), the steps ("0/2"), the status with its dot, and an arrow.
On a phone the date and steps give way. Group headings are small capitals
with a dot: OVERDUE red, TODAY orange, THIS WEEK blue, LATER purple, NO DATE
grey, and WAITING FOR MY ANSWER yellow. Under each group the rows come in
my own order (below), then any I haven't placed, soonest first.

- **Picked for today** comes first: what I picked on today's check-in, in my
  own order, from the check-in. Those rows drag up and down to set that
  order, and never leave the group. Dragging is off while a search or filter is
  on. A picked task shows only here, not again under its due date.
- **Then every other open task of mine**, split into Waiting for my answer,
  Overdue, Today, This week (the next seven days), Later and No date, then
  **Done** last, each with its count. Today, This week, Later, No date and
  Done show even when empty, so a task can be dragged into them; the other
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
  today, This week tomorrow, Later eight days on, No date with no date, Done
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
  Project Lists have the same arrow.
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
    This week tomorrow, Later eight days from today, No date clears the date,
    and Done marks it Done. It is the same save as the Due cell or the Done
    tick, so it loses any "Due by" time, counts toward "Date moved 3 times",
    and a Done a required field refuses is put back with the reason.
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

The magnifying glass opens the search box, which stays open while it holds
words; Escape empties and closes it. Filter holds Status, Priority, Due,
Tags, Type and Client, then Clear and Save as view. Due is the project
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
Due date, Priority, Add tag, Remove tag and Type. There is no Move to project
here, and every live type is offered, so a project that doesn't offer one
refuses it for its own tasks. Each task is changed on its own,
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

A task whose clock is running shows the ticking time and a Pause button at
the end of its row, so it pauses without being opened (Tyler, 20 Oct 2026;
see [The task clock](task-clock.md)).

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
  steps and chat here."

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

- **Three panels, the same frame.** Left: the site admin and the cards with
  something in them, or the Inbox in their place.
  Middle: their tasks. Right: the open task, with no cross. Below 1280px wide
  one panel at a time, with Me, My tasks and Task tabs.
- **The inbox icon** in the header, left of the cog, swaps the cards for the
  Inbox, and pressed again brings the cards back (Tyler, 25 Oct 2026: "add an
  inbox icon here with red bubble notification. the inbox open in that tab
  instead of card it currantly does"). A red bubble on it counts unread
  notices, "9+" past nine, and drops as they are read here. The Inbox there
  has no card around it: its heading, Mark all read, the tabs and the rows
  sit straight in the panel. The page opens on the cards. While the Inbox
  shows, the icon morphs into a cross (Tyler, 25 Oct 2026: "make the inbox
  morphed into an x when its in the inbox tab", then "make it morph"): the
  tray's outline folds flat into one stroke and its dip straightens into the
  other, over about a quarter of a second, and back again on the way out
  (`inbox-morph-icon.tsx`). The bubble hides while it is a cross; the cross
  brings the cards back.
- **The header** shows their photo, name and "Site admin". The cog opens My
  settings: their email, then **Time zone** and **Bell notices** as rows that
  fold open. There is no check-in time or job title. The bell notices include
  the two only the site admin gets: who checked in this morning, and joins
  through a team's link.
- **Their time zone.** Today, Due this week, Meetings today and Done today
  count in it. Before one is saved, the first visit saves the browser's zone
  (until then the page counts in UTC). It lives on
  `project_site_admin_prefs`, beside their Board's column order, since the
  site admin has no team row to keep either on.
- **The middle** is the same My tasks as an employee's (List, Board, Calendar,
  Timeline, search, Filter, Views, New task), with every open task handed to
  them in any team's projects mixed with their own list. **The List is the
  project page's table** (Tyler, 23 Oct 2026: "The tasks table have to look
  like the project's tasks table"), grouped under Overdue, Today, This week,
  Later, No date and Done, with Mass select, each cell changing its task, and
  a cog and a bin in Actions. Ticked rows gather in the "1 selected" button in
  the header, left of the search, as on a project page. Its columns are Task, **Project**, Status,
  Priority, Due and Actions. Tyler first asked for Team and Project as their
  own columns, then had Assigned to, Steps and Team taken off ("remove the
  assigned to, steps and my team col"). The Project cell is a chip with the
  project's colour and its own name ("Just me" for their own), and picking it
  moves the task (Tyler: "I should be able to select a project in the project
  col and the text there to be in a chip form"). Every task's dropdown is the
  same ("all should be this"): **Just me** ("its missing a 'just me'
  option"), then every team's open projects under the team's name, with the
  task's own project ticked. It is the task's own Move to project, so steps,
  chat and files go with it, and it shows no message ("It doesnt need a toast
  confirmation"). A task moved to another team loses its tags, type and type
  fields, which belong to its old team. Only a task the site admin is doing
  can go into their list; one someone else is doing stays shared. The Board, Calendar and Timeline still name the team with the
  project ("Acme · Website").
  There are no picks for today; rows drag as on an employee's List, once
  Mass select is on (Dragging rows, above). Filter offers
  every team's tags and types. Saved views are kept under their own id
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
  team's questions (its tags, its people), as on its project page.
- **No live updates.** An employee's My dashboard reloads when a task of
  theirs changes elsewhere; the site admin's loads with the page, since the
  live stream is per team and theirs spans every team.

### The cards

Top to bottom, red first, then amber, blue and green (Tyler, 24 Oct 2026:
"red card should be on top"), keeping his "act first" order inside each
colour. Each counts across every team,
folds and is remembered open or shut in this browser, and shows its five most
urgent rows then "Show all 12" for the rest. A task in a card opens on the
right.

**A card with nothing in it is not drawn.** When all nine are empty, nothing
stands in for them and the panel is blank below the header (Tyler, 25 Oct
2026, of the "All clear" card that used to: "Just dont show anything").
Tyler on 24 Oct 2026, when every empty card still showed as "Waiting on you ·
None" and the like: "this is way too many cards. we need to simplify it".

**Each card is tinted by how much it matters**, the same day: "each card
should be a color based on their importance like the done card should have a
green card". Red needs the site admin now: Waiting on you, Needs attention,
Projects running late. Amber is for soon: No one on it, Invites not taken, Due
this week. Blue is to know about: Meetings today, Milestones this month. Green
is Done today. The tints are see-through
(`TONE` in `admin-cards.tsx`), so they work in light and dark.

1. **Waiting on you:** asks for more time that fall to them: nobody else
   handed the task out, they handed it out themselves, or whoever did can no
   longer see it. Each row has the task, who asked, the new day and the old,
   the reason, and **Yes** and **No** in the card. Yes moves the date; No opens
   a box for an optional reason. Both are the task's own answer, with its
   history line and its notice.
2. **Needs attention:** each team with Stuck, Overdue or Untouched tasks,
   counted exactly as that team's Attention tab counts them, the most first.
   A count opens the team on its Needs attention tab.
3. **Projects running late:** shared open projects whose status is Slowing
   down or Behind, the most late tasks first, counted on this browser's clock
   as the Projects page counts them. A row opens the project.
4. **No one on it:** open tasks with nobody on them, soonest due first. Each
   has a **Hand to** picker with the project's people and the site admin;
   picking one hands it over the same way the task's own Hand to does.
5. **Invites not taken:** people put on a team who haven't set a password,
   the longest waiting first, with **Resend**, which makes a fresh link.
6. **Due this week:** open tasks in any team due today to six days on,
   soonest first, then High before Normal before Low.
7. **Meetings today:** every team's meetings on their today, earliest first,
   with the time in their zone. A row opens that team's calendar on that day.
8. **Milestones this month:** milestones due today to 30 days on, with how
   many of their tasks aren't Done ("All done" when none are left).
9. **Done today:** tasks finished in their today, by person ("Carla · 3"),
   the most first. A name folds open its tasks.
The Inbox is not among them: it is behind the header's inbox icon.

## Where it lives

- **Reader:** `src/server/project/my-dashboard.ts`, and
  `src/server/project/admin-dashboard.ts` for the site admin's.
- **Screen:** `src/components/project/my-dashboard.tsx`, and
  `admin-dashboard.tsx` with `admin-cards.tsx` for the site admin's. Both
  share My tasks (`my-tasks-panel.tsx`) and the Inbox card (`inbox-card.tsx`),
  laid out by
  `src/components/project/three-panels.tsx`, which the project page and the
  Team dashboard share. Widths are remembered under the keys in
  `src/lib/project/panel-keys.ts`.
- **Route:** `src/routes/_authenticated/dashboard.tsx`.
- **The task in the right panel:** `src/components/project/task-side-panel.tsx`,
  shared with the project page, with the address handled by
  `src/lib/hooks/use-task-address.ts`.
