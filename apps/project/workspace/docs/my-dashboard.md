# My dashboard

`/dashboard`, first in the left menu, is each person's own page. Tyler asked
for it on 10 Oct 2026: three panels, me on the left, my tasks in the middle,
my inbox on the right. The panels resize and collapse like the project page's.
Below 1280px wide one panel shows at a time, with My tasks, Me and Inbox tabs.
Switching tabs keeps each panel as it was: My tasks stays on Open, and Time
off doesn't load again.

## Left: me

- **Who I am on the team**: photo, name, email, the team, my role and the day
  I joined.
- **Today's check-in.** One sentence on where it stands ("Your check-in time
  today is 9:00 AM." or "You checked in at 9:12 AM. That was late…"), and a
  Check in button. After checking in, the button reads "Change today's picks".
  Both open the check-in window (see [The morning check-in](morning-check-in.md)).
- **Check out**, beside it once I've checked in, opens the optional evening
  check-out. After it, the button reads "Change check-out" and a line says
  when I checked out. Nothing reminds me and nobody else sees it (see
  [The evening check-out](morning-check-in.md#the-evening-check-out)).
- **My check-in record.** Under today's check-in, one line: "On time 18 of
  the last 20 work days", counted from my saved rows only: my last 20 work
  days, on time when I checked in by my check-in time. Days off and time off
  are saved as days off, so they're left out, and today counts once I've
  checked in. **It's mine alone**: nobody else can read it, not the owner or
  an admin, and it never shows on the Team dashboard. It's there to keep my
  own streak going, not to watch anyone.
- **My week**: from Monday to today, what I finished, what I carried over,
  what I dropped with the reasons, and "Checked in on 4 of 5 work days".
  Arrows step back a week at a time, up to 12 weeks. It reads only my saved
  check-in rows: a pick counts as finished when its day ended Done, or is
  Done now on a day still going on, and each task shows once. Today counts as
  a work day once I've checked in, and a check-in on a day off doesn't count,
  so it never reads "5 of 4". **Only I can read it**, not the owner or an
  admin (`src/server/project/my-week.ts`, `my-week-card.tsx`). Tyler left out
  the weekly manager email; the check-in isn't for watching people.
- **Time off**: my days off coming up, with Add time off (a first and last
  day) and a bin button that asks before taking one off. See Time off in
  [The morning check-in](morning-check-in.md#time-off).
- **My check-in time**: my own time and time zone, saved on change.
- **Job title** and **My check-in time** each say Saving…, then Saved or Not
  saved, beside the field. See
  [Fields that save themselves](fields-that-save-themselves.md).

## Middle: my tasks

Three tabs, in the same sortable table as a project's List tab:

- **Today**: what I picked on today's check-in, in my own order. It is the
  tab the page opens on when I have picks. Rows drag up and down to set that
  order, which only I see; sorting by a column turns dragging off, with "Use
  my order" to go back, as on a project's List tab. Dragging is off while a
  search or filter is on.
- **Open**: every task assigned to me that isn't Done, split into Waiting
  for my answer, Overdue, Today, This week (the next seven days), Later and No
  date, each with its count. Empty groups are hidden. **Accept all 9 tasks**
  sits beside "9 tasks are waiting for you…": each is accepted on its own, so
  each writes its history line, and the result says "9 accepted", or names one
  that changed hands since with the reason. "Today" is my own day,
  in my time zone, the same day the check-in uses.
- **Done**: my finished tasks.

A search box and Status and Label filters sit above all three tabs, and live
in the address like the project page's. There is no Person filter here, since
every task is mine.

Ticked rows can be marked Done together, or changed with the same bar as a
project's List tab: Status, Hand to (with one optional note for them all) and
Due date. There is no Move to project here. Each task is changed on its own,
so each writes its history and sends its notices, and the result says "5
tasks changed, 1 refused." naming the refused ones with their reasons. My
tasks span projects, so Hand to refuses anyone who isn't on a task's project. Clicking a task opens it in the
middle panel, in my tasks' place, with Back at the top. Back and the browser's
own back button return to the same tab scrolled to the same spot. The address
is `?task=<id>`. How a task opens is in
[Projects and tasks](projects-and-tasks.md#opening-a-task).

## Right: my inbox

The same notices the bell holds, newest first, 30 at most. Clicking one goes
where the bell would take it and marks it read. If marking it read fails,
the unread dot and the count come back and an error says so, the same as in
the bell. A task's notice opens the task
on its project page, in the middle panel. The check-in reminder opens
this page with the check-in window open (`/dashboard?checkin=true`).

## Where it lives

- **Reader:** `src/server/project/my-dashboard.ts`.
- **Screen:** `src/components/project/my-dashboard.tsx`, laid out by
  `src/components/project/three-panels.tsx`, which the project page and the
  Team dashboard share. Widths are remembered under the keys in
  `src/lib/project/panel-keys.ts`.
- **Route:** `src/routes/_authenticated/dashboard.tsx`.
- **The task in the middle panel:** `src/components/project/task-in-place.tsx`,
  with the address handled by `src/lib/hooks/use-task-address.ts`.
