# History

Two views of the past, both read only from rows saved as things happened:
each task's history on the task itself, and the Team dashboard's calendar of
check-ins. Nothing is worked out again from today's tasks, because a task's
status today says nothing about what it was last Tuesday. The rows are
described in [The morning check-in](morning-check-in.md).

## Task history

A task ends with a History card, oldest first, wherever it opens.

- **Every day someone picked the task**, with who picked it, whether they
  carried it over, and its status when their day ended. A day still going on
  says "today, so far" with the status now.
- **Every drop**, with who dropped it and the reason.
- **Every hand-over**: "Anna handed it to Ben", "Ben accepted it", "Ben handed
  it back to Anna: the reason". A hand-over's note shows after it, "Anna
  handed it to Ben: Client wants it by Thursday", and stays after the task is
  accepted.
- **Reviews**: "Anna confirmed the review" and "Anna sent it back to Ben:
  Missing the team photo", from 11 Oct 2026. These are written down as they happen, in
  `project_task_events` (`drizzle/0096_project_task_events.sql`), because a
  task only holds who has it now. Hand-overs from before 10 Oct 2026 weren't
  written down and don't show.
- **A step that became its own task**: "Anna made the step "Spam protection"
  its own task" on the task it came from, and "Anna made this from a step in
  Build the contact form" on the new one, each linking to the other. A link
  to a task the reader can't see is left off.
- **A move**: "Anna moved it here from Website", from 10 Oct 2026.
- **Made, marked and binned**: "Anna made it", "Ben marked it Done", "Anna put
  it in the bin", "Anna brought it back from the bin", from 11 Oct 2026.
- **Due date moves**: "Anna moved the due date from Nov 3 to Nov 10", from
  12 Oct 2026, in the History card and the Activity tabs. Only a move from
  one day to another is written; setting a first date or clearing one isn't.
  The row's reason holds the two days, "2026-11-03 2026-11-10"
  (`src/lib/project/due-moves.ts`).
  A status the app doesn't know reads "Ben changed its status".
  Comments are written down too, for the project's Activity tab, but the
  History card leaves them out because the chat already shows them.
- **One table for the task and the project.** The project's Activity tab
  ([Projects and tasks](projects-and-tasks.md#activity)) reads these same
  rows. New moments get new kinds; saved kinds are never renamed.
- **Who sees it:** the same people who can open the task. That is the
  project's members, plus the team's owner and admins.
- **People who left keep their lines.** A person removed from the team still
  shows by name on the days they picked the task.

## The "Picked on many days" mark

- **A task picked on 3 or more days and still not Done** shows "Picked on 4
  days". The count is days, not people: two people picking it on the same day
  counts once.
- **It shows on the project board and List tab, on My dashboard, in the
  check-in window and at the top of the task.**
- **It goes when the task is Done.**
- The 3 lives in `PICKED_MANY_DAYS` in `src/lib/project/rules.ts`.

## The "Date moved" mark

- **A task not Done whose due date moved 3 or more times** shows "Date moved
  3 times" beside its date, on the task, Board cards and List rows, the same
  way "Picked on 4 days" works for picks. It counts the moves written in its
  history, so moves before 12 Oct 2026 don't count.
- **It goes when the task is Done.**
- The 3 lives in `DUE_MOVED_MANY` in `src/lib/project/rules.ts`.

## Past days on the Team dashboard

There is no calendar page per person. Tyler, 10 Oct 2026: "we dont need
calender and check in with its own dashboard". Past days are read on the
[Team dashboard](teams-and-invites.md#the-team-dashboard).

- **The month calendar** in its middle panel shows, for each day so far, how
  many people checked in out of those expected ("4 of 6 in") and how many
  were blocked, meaning they wrote a Blocker note or had a picked task that
  ended the day Stuck. The team's meetings sit under the counts (see
  [Meetings](meetings.md)).
  Expected means everyone on a work day, plus anyone who checked in on a day
  off. Today's square counts the team's size on a work day.
- **Clicking a day** shows that day's check-ins on the right: for each person,
  when they checked in (and whether late), "Yesterday" (what they picked on
  their check-in before that day), "Today" (what they picked that day), and a
  red "Blocker" line for each pick that was Stuck that day. The blocker's
  reason shows while the task is still Stuck, because a reason isn't saved
  per day. People who are blocked come first.
- **Notes on past days.** The notes a person typed at check-in stay on that
  day's row, so a past day reads "Today · Work on members table" with the
  picked tasks in grey under it, exactly as it did on the day. Notes can only
  be changed on the day itself.
- **Under the words of their day.** If the team renamed its boxes, a day
  reads under the words it was checked in with, saved on the row. Days before
  11 Oct 2026 read Yesterday, Today and Blocker.
- **Holidays** show their name in the calendar square, and the day reads
  "Christmas Day, a team holiday."
- **Replies and thanks stay with the day.** A blocker's replies show under it
  on any day, and each person's line of thanks counts the thanks they got on
  that day of their own calendar.
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
