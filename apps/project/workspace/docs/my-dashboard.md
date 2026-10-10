# My dashboard

`/dashboard`, first in the left menu, is each person's own page. Tyler asked
for it on 10 Oct 2026: three panels, me on the left, my tasks in the middle,
my inbox on the right. The panels resize and collapse like the project page's.
Below 1280px wide one panel shows at a time, with My tasks, Me and Inbox tabs.

## Left: me

- **Who I am on the team**: photo, name, email, the team, my role and the day
  I joined.
- **Today's check-in.** One sentence on where it stands ("Your check-in time
  today is 9:00 AM." or "You checked in at 9:12 AM. That was late…"), and a
  Check in button. After checking in, the button reads "Change today's picks".
  Both open the check-in window (see [The morning check-in](morning-check-in.md)).
- **My check-in time**: my own time and time zone, saved on change.

## Middle: my tasks

Three tabs, in the same sortable table as a project's List tab:

- **Today**: what I picked on today's check-in. It is the tab the page opens on
  when I have picks.
- **Open**: every task assigned to me that isn't Done, Waiting ones first, with
  a line saying how many wait for my answer.
- **Done**: my finished tasks.

Ticked rows can be marked Done together. A task opens in the usual task
window, and its address is `?task=<id>`.

## Right: my inbox

The same notices the bell holds, newest first, 30 at most. Clicking one goes
where the bell would take it and marks it read. The check-in reminder opens
this page with the check-in window open (`/dashboard?checkin=true`).

## Where it lives

- **Reader:** `src/server/project/my-dashboard.ts`.
- **Screen:** `src/components/project/my-dashboard.tsx`, laid out by
  `src/components/project/three-panels.tsx`, which the project page and the
  Team dashboard share. Widths are remembered under the keys in
  `src/lib/project/panel-keys.ts`.
- **Route:** `src/routes/_authenticated/dashboard.tsx`.
