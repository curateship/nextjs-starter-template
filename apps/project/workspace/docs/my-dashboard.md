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
- **My check-in record.** Under today's check-in, one line: "On time 18 of
  the last 20 work days", counted from my saved rows only: my last 20 work
  days, on time when I checked in by my check-in time. Days off and time off
  are saved as days off, so they're left out, and today counts once I've
  checked in. **It's mine alone**: nobody else can read it, not the owner or
  an admin, and it never shows on the Team dashboard. It's there to keep my
  own streak going, not to watch anyone.
- **Time off**: my days off coming up, with Add time off (a first and last
  day) and a bin button that asks before taking one off. See Time off in
  [The morning check-in](morning-check-in.md#time-off).
- **My check-in time**: my own time and time zone, saved on change.
- **Job title** and **My check-in time** each say Saving…, then Saved or Not
  saved, beside the field. See
  [Fields that save themselves](fields-that-save-themselves.md).

## Middle: my tasks

Three tabs, in the same sortable table as a project's List tab:

- **Today**: what I picked on today's check-in. It is the tab the page opens on
  when I have picks.
- **Open**: every task assigned to me that isn't Done, split into Waiting
  for my answer, Overdue, Today, This week (the next seven days), Later and No
  date, each with its count. Empty groups are hidden. "Today" is my own day,
  in my time zone, the same day the check-in uses.
- **Done**: my finished tasks.

A search box and Status and Label filters sit above all three tabs, and live
in the address like the project page's. There is no Person filter here, since
every task is mine.

Ticked rows can be marked Done together. Clicking a task opens it in the
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
