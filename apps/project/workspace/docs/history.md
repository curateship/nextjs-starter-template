# History

Two views of the past, both read only from rows saved as things happened:
each task's history inside its window, and the Team dashboard's calendar of
check-ins. Nothing is worked out again from today's tasks, because a task's
status today says nothing about what it was last Tuesday. The rows are
described in [The morning check-in](morning-check-in.md).

## Task history

The task window ends with a History card, oldest first.

- **Every day someone picked the task**, with who picked it, whether they
  carried it over, and its status when their day ended. A day still going on
  says "today, so far" with the status now.
- **Every drop**, with who dropped it and the reason.
- **Every hand-over**: "Anna handed it to Ben", "Ben accepted it", "Ben handed
  it back to Anna: the reason". These are written down as they happen, in
  `project_task_events` (`drizzle/0096_project_task_events.sql`), because a
  task only holds who has it now. Hand-overs from before 10 Oct 2026 weren't
  written down and don't show.
- **Who sees it:** the same people who can open the task. That is the
  project's members, plus the team's owner and admins.
- **People who left keep their lines.** A person removed from the team still
  shows by name on the days they picked the task.

## The "Picked on many days" mark

- **A task picked on 3 or more days and still not Done** shows "Picked on 4
  days". The count is days, not people: two people picking it on the same day
  counts once.
- **It shows on the project board and List tab, on My dashboard, in the
  check-in window and at the top of the task window.**
- **It goes when the task is Done.**
- The 3 lives in `PICKED_MANY_DAYS` in `src/lib/project/rules.ts`.

## Past days on the Team dashboard

There is no calendar page per person. Tyler, 10 Oct 2026: "we dont need
calender and check in with its own dashboard". Past days are read on the
[Team dashboard](teams-and-invites.md#the-team-dashboard).

- **The month calendar** in its middle panel shows, for each day so far, how
  many people checked in out of those expected ("4 of 6 in") and how many
  were blocked, meaning they had a picked task that ended the day Stuck.
  Expected means everyone on a work day, plus anyone who checked in on a day
  off. Today's square counts the team's size on a work day.
- **Clicking a day** shows that day's check-ins on the right: for each person,
  when they checked in (and whether late), "Yesterday" (what they picked on
  their check-in before that day), "Today" (what they picked that day), and a
  red "Blocker" line for each pick that was Stuck that day. The blocker's
  reason shows while the task is still Stuck, because a reason isn't saved
  per day. People who are blocked come first.
- **A task in a project the viewer isn't on** reads "1 task in another
  project", never its title, its reason or a link.
- **A person removed from the team** no longer appears there. Their rows stay
  for task history.

## Where it lives

- **Task history:** `src/server/project/task-history.ts`, drawn by
  `src/components/project/task-history-card.tsx`.
- **Team dashboard calendar and check-ins:** `src/server/project/team-days.ts`,
  drawn by `src/components/project/team-dashboard.tsx`. The address keeps the
  month, day and open task: `/team?month=2026-10&day=2026-10-08`.
- **Tests:** `src/server/project/checkins.test.ts`.
