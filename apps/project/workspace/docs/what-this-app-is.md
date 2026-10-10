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
  top level, and a team holds its people and its projects. Version 1 has two
  dashboards, Projects and Team. Tyler: "A workspace can come later as a
  workspace switcher like notion but right now we just have projects and team
  dashboard".
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
- The morning check-in and the Today board.
- Task history and each person's calendar of check-ins.

The work is split into three task files in `workspace/tasks/`, numbered in the
order they get built.

## Left out on purpose

- The evening check-out and the weekly manager email.
- Guests who see only some projects.
- Online status, screenshots and activity timers. The check-in is the only thing
  the app tracks about a person.
