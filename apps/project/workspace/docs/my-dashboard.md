# My dashboard

`/dashboard`, first in the left menu, is each person's own page. Tyler asked
for it on 10 Oct 2026: three panels, me on the left, my tasks in the middle,
my inbox on the right. The panels resize and collapse like the project page's.
Below 1280px wide one panel shows at a time, with My tasks, Me and Inbox tabs.
Switching tabs keeps each panel as it was: My tasks stays on Open, and Time
off doesn't load again. Tyler redrew all three panels on 13 Oct 2026
(`assets/pasted-image-1791938818669097000.png`); what follows is that
version.

## Left: me

- **The header** shows my photo, my name, and my role and team ("Owner · My
  team"). The cog beside it opens My settings, a dropdown with my email and
  the day I joined, my Job title, My check-in time and My notices (below).
  Closing it saves the field being typed in.
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
  checked in. **It's mine alone**: nobody else can read it, not the owner or
  an admin, and it never shows on the Team dashboard. It's there to keep my
  own streak going, not to watch anyone.
- **My week · Oct 12 to 13**: "Checked in on 4 of 5 work days" with the
  arrows beside it and a bar filling the same share, then Finished, Carried
  over and Dropped as rows with a count or "None", each task listed under its
  row (a drop with its reason). Arrows step back a week at a time, up to 12
  weeks. It reads only my saved
  check-in rows: a pick counts as finished when its day ended Done, or is
  Done now on a day still going on, and each task shows once. Today counts as
  a work day once I've checked in, and a check-in on a day off doesn't count,
  so it never reads "5 of 4". **Only I can read it**, not the owner or an
  admin (`src/server/project/my-week.ts`, `my-week-card.tsx`). Tyler left out
  the weekly manager email; the check-in isn't for watching people.
- **Time off**: my days off coming up, with Add time off (a first and last
  day) and a bin button that asks before taking one off. With none coming
  up, "No time off coming up." and a small Add share one line. See Time off in
  [The morning check-in](morning-check-in.md#time-off).
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

Three tabs, Today, Open and Done, each with its count, then the search box,
Filter and Views along the same header, as on the project page. A task is
one row (`src/components/project/my-task-rows.tsx`): a round tick box, the
title with the project and its chips under it (High, the type, labels, "Date
moved 5 times", "Waiting on 1 task", "3 new"), then the due date ("Overdue ·
Oct 12" in red), the steps ("0/2"), the status with its dot, and an arrow.
On a phone the date and steps give way. Group headings are small capitals
with a dot: OVERDUE red, TODAY orange, THIS WEEK blue, LATER purple, NO DATE
grey, and WAITING FOR MY ANSWER yellow. Rows sort soonest first.

- **Today**: what I picked on today's check-in, in my own order. It is the
  tab the page opens on when I have picks. Rows drag up and down to set that
  order, which only I see. Dragging is off while a search or filter is on.
- **Open**: every task assigned to me that isn't Done, split into Waiting
  for my answer, Overdue, Today, This week (the next seven days), Later and No
  date, each with its count. Empty groups are hidden. **Accept all 9 tasks**
  sits beside "9 tasks are waiting for you…", on a grey line: each is accepted on its own, so
  each writes its history line, and the result says "9 accepted", or names one
  that changed hands since with the reason. "Today" is my own day,
  in my time zone, the same day the check-in uses.
- **Catch up** sits at the end of a red line, "9 tasks are overdue.", on
  the Open tab, while anything is overdue and no search or filter is on. It opens a
  window listing those tasks, the same ones as the Overdue group, all
  ticked. Untick any to keep, then pick one new due date and press "Move 7
  tasks", or press "Leave with no date". It is the bulk bar's due date
  change (`changeManyTasks`), so each task is checked on its own, a refused
  one is named in the error, and every move counts toward "Date moved 3
  times" (Tyler's choice, 13 Oct 2026, so slipped work stays visible). A
  moved task loses its "Due by" time, the same as any new date
  (`src/components/project/catch-up-dialog.tsx`).
- **Done**: my finished tasks.

A task whose chat has messages I haven't read says "3 new" beside its title,
and opening it reads them (see [Task chat](task-chat.md#new-messages)).

The search box sits in the header when the middle panel is at least 640px
wide; narrower, it is the first row of the Filter popover, with a "Searching
for …" line under the header. Filter holds Status, Priority, Label and Type,
then Clear and Save as view. All of it lives in the address like the
project page's. There is no Person filter here, since every task is mine.

A tick in a round box selects the task without opening it. Ticked rows can be marked Done together, or changed with the same bar as a
project's List tab: Status, Hand to (with one optional note for them all) and
Due date. There is no Move to project here. Each task is changed on its own,
so each writes its history and sends its notices, and the result says "5
tasks changed, 1 refused." naming the refused ones with their reasons. My
tasks span projects, so Hand to refuses anyone who isn't on a task's project. Clicking a task opens it in the
right panel, in my inbox's place, the same panel as on the project page
(Tyler, 13 Oct 2026). My tasks stay in view, and the open task's row is
shaded with a dark bar down its left edge. The cross at the top right, or
the browser's own back button, closes the task and the inbox comes back on
the tab and at the spot I left it. Opening another task swaps it in place.
On a narrow screen the right panel's tab reads Task while a task is open,
opening one switches to it, and closing it goes back to My tasks. The
address is `?task=<id>`. How a task opens is in
[Projects and tasks](projects-and-tasks.md#opening-a-task).

## Right: my inbox, or the open task

While a task is open it takes this panel (see Middle above). Otherwise:
"Inbox · 5 unread" with **Mark all read** in the header, then tabs: All,
Unread, Tasks (Project's own notices), Flows (an automation waiting for
approval or one that failed) and News (product updates and announcements).
A notice of any other kind, such as feedback, shows under All and Unread
only. The same notices the bell holds, newest first, 30 at most. Clicking
one goes where the bell would take it and marks it read. If marking it read
fails, the unread dot and the count come back and an error says so, the
same as in the bell. Mark all read marks every notice read, the bell's own
button, and says "Everything here is read." when there's nothing to mark. A
task's notice opens the task on its project page, in the right panel. The
check-in reminder opens this page with the check-in window open
(`/dashboard?checkin=true`).

## Where it lives

- **Reader:** `src/server/project/my-dashboard.ts`.
- **Screen:** `src/components/project/my-dashboard.tsx`, laid out by
  `src/components/project/three-panels.tsx`, which the project page and the
  Team dashboard share. Widths are remembered under the keys in
  `src/lib/project/panel-keys.ts`.
- **Route:** `src/routes/_authenticated/dashboard.tsx`.
- **The task in the right panel:** `src/components/project/task-side-panel.tsx`,
  shared with the project page, with the address handled by
  `src/lib/hooks/use-task-address.ts`.
