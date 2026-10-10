# What this app is

Project is a standalone product: a task app for small teams that hand work to
each other, which will be sold on its own as a subscription app. Every work
day, each person checks in and picks the tasks they will work on, and the team
sees everyone's day on one board.

The code starts as a copy of the repo's shell template, the same as every app
here. That is how it is built, not what it is. Every choice about screens,
words and features is made for Project's own customers.

These are Tyler's rules for the app, chosen on 10 Oct 2026. This file outranks
the code. If the code disagrees with a line here, the code is wrong.

## Who it is for

- Small teams that delegate tasks. Tyler: "for small teams with tasks
  delegations. team members check-in at certain time and select what tasks
  they're doing today, the tasks progression etc..."

## The rules

- **Check-in time.** The team sets one check-in time, and each person can shift
  it to suit their own hours.
- **Reminder.** The check-in reminder is a notice in the in-app bell. There is
  no email, browser pop-up or Slack reminder.
- **Handing out tasks.** Anyone on the team can hand a task to anyone else. The
  task always records who handed it out.
- **Progress.** A task's status is To do, Doing, Done or Stuck. A task can also
  carry an optional checklist of steps, so progress reads as "3 of 5 steps
  done". There is no percentage slider.
- **Check-out.** The evening check-out is optional when it is built, and it is
  not part of the first version.
- **There is no workspace.** Tyler: "There is no workspace." The team is the
  top level, and a team holds its people and its projects. Tyler: "A
  workspace can come later as a workspace switcher like notion but right now
  we just have projects and team dashboard".
- **Three dashboards: My dashboard, Projects and Team.** Tyler, 10 Oct 2026:
  "we dont need calender and check in with its own dashboard". There is no
  separate check-in page, Today board or person calendar.
- **My dashboard.** Tyler, 10 Oct 2026: "There should be "My dashboard" and
  put check in there instead and my tasks there as well. This should be a 3
  col dashboard with left panel shows my avatar and my informations like
  name, date joined etc.. middle is my tasks and right panel can show my inbox
  (notifications)". Check in is a button on its left panel that opens a
  window.
- **The Team dashboard.** Tyler gave a mockup on 10 Oct 2026
  (`assets/pasted-image-1791659665679304000.png`): the team and its members on
  the left, a month calendar in the middle, and one day's check-ins on the
  right. Until meetings are built, the calendar shows each day's check-ins
  (Tyler's choice). Each person's check-in shows "Yesterday" and "Today" as the
  tasks they picked, and a "Blocker" line for a picked task that is Stuck.
- **Team settings live in a window on the Team dashboard.** Tyler first said
  "The team settings goes into app settings in settings", then chose the
  window when told that Settings only opens for app admins, so a customer who
  owns a team couldn't reach it.
- **Teams belong to Project.** Teams, invites and roles are part of this
  product and are built inside `apps/project` only.
- **Project members.** People are added to a project, and only they see it.
  Tasks in a project can only be handed to its members.
- **The project page.** Tyler asked for "the existing 4 panel dashboard (except
  the bottom panel)": project details on the left, the tasks in the middle as
  Board and List tabs, and the project's members on the right.
- **Price.** Project will become its own paid subscription product. It is free
  for now, and there is no billing work until Tyler decides on pricing.

## The first version

- Teams, email invites, projects and tasks.
- The morning check-in, on My dashboard, and the Team dashboard.
- Task history, and past days on the Team dashboard's calendar.

The work is split into three task files in `workspace/tasks/`, numbered in the
order they get built.

## Left out on purpose

- The evening check-out and the weekly manager email.
- Guests who see only some projects.
- Online status, screenshots and activity timers. The check-in is the only thing
  the app tracks about a person.
