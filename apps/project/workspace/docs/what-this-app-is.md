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
  right. The calendar shows each day's check-ins and the team's meetings.
  Each person's check-in shows their own "Yesterday", "Today" and "Blocker"
  notes, with the tasks they picked under each, and a "Blocker" line for a
  picked task that is Stuck.
- **Team settings live in a window on the Team dashboard.** Tyler first said
  "The team settings goes into app settings in settings", then chose the
  window when told that Settings only opens for app admins, so a customer who
  owns a team couldn't reach it.
- **Teams belong to Project.** Teams, invites and roles are part of this
  product and are built inside `apps/project` only.
- **A task opens in the middle panel.** On the project page and My dashboard,
  clicking a task swaps the task list for the task, with a Back button. Tyler
  asked for this with a chat box on 10 Oct 2026, and confirmed it is for those
  two pages only. The Team dashboard and the check-in keep opening a task as a
  window.
- **Tags in a task's chat.** Typing @ tags someone on the project and sends
  them a bell notice. Editing a message tells only people newly tagged. Tyler
  chose this on 10 Oct 2026.
- **Files on a task.** Up to 10 files of 10 MB each per task, and 5 GB for the
  whole team. Tyler chose the 5 GB on 10 Oct 2026.
- **Project members.** People are added to a project, and only they see it.
  Tasks in a project can only be handed to its members.
- **The project page.** Tyler asked for "the existing 4 panel dashboard (except
  the bottom panel)": project details on the left, the tasks in the middle as
  Board and List tabs, and the project's members on the right.
- **No long dashes on screen.** Tyler, 11 Oct 2026: "I dont like the em
  dashes." Text people read uses no em or en dash: an empty cell is blank,
  a missing figure reads "None", and a time range reads "10:00 to 10:45 AM".
- **Price.** Project will become its own paid subscription product. It is free
  for now, and there is no billing work until Tyler decides on pricing.

## Choices for the next features

Tyler answered these on 10 Oct 2026, before the Next features tasks 02 to 08
were built.

- **The team's morning notice** goes out 30 minutes after the latest check-in
  time in the team, so its numbers are complete.
- **Dragging tasks into order** sets one order for the whole project, which
  everyone on it sees.
- **A step given to someone** shows only inside its task, never in their My
  tasks or check-in. Work they should pick at check-in becomes its own task.
- **A repeating task** whose last copy isn't Done skips its turn, so copies
  never pile up.
- **A "Just me" task** can later be moved into a project.
- **The bin.** Whoever could delete a task can bring it back. Emptying the bin
  early is for owners and admins.
- **Copying a project** leaves every task's due date empty.
- **Time off.** Each person marks their own days off, and owners and admins can
  mark them for anyone.
- **Needs attention** is a tab in the Team dashboard's right panel, beside the
  day's check-ins, for owners and admins.
- **Handing over all of someone's tasks** never adds the receiver to a
  project. Tasks in projects they aren't on are left with nobody assigned.
- **The team join link** lets people in straight away, with no approval.
  Owners and admins hear about each join in the bell.

## Choices for the Team dashboard

Tyler answered these on 11 Oct 2026, before the Team dashboard tasks 01 and 02
were built. Each was the recommended option.

- **Meetings.** Anyone on the team makes one; only its maker, the owner and
  admins change or delete it. A meeting belongs to the team and everyone sees
  it. It repeats never, weekly or every 2 weeks. A person gets a bell notice
  when added to one, and no reminder before it starts. The video link is any
  https address, named when it is a known service.
- **Check-in notes** are optional. On the Team dashboard the note comes first
  with the picked tasks in a small grey line under it. A typed Blocker note
  and a Stuck picked task both mark someone blocked.
- **The check-in rate** counts work days only, and a late check-in counts.
- **The team photo** is changed by the owner and admins.
- **Open tasks** counts only projects the viewer can see, leaving out "Just
  me" lists and the bin.

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
