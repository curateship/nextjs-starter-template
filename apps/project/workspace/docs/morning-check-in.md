# The morning check-in

Every work day each person checks in once and picks the tasks they will work
on today. The check-in is the reason Project exists instead of being another
task board. Tyler's rules for it are in [What this app is](what-this-app-is.md),
which outranks this file.

The check-in is a window opened from the Check in button on
[My dashboard](my-dashboard.md). Tyler, 10 Oct 2026: "we dont need calender and
check in with its own dashboard".

## When a person checks in

- **The team sets one time.** The owner or an admin sets the daily check-in
  time, time zone and work days on the Team dashboard.
- **Each person can shift it.** "My check-in time" on the left of My
  dashboard holds a time and a time zone. Each saves when it is left
  or picked. There is no Save button. Picking the team's own time, or "Use the
  team's time", goes back to following the team.
- **"Today" is the person's own day.** Today and yesterday are worked out in
  the person's time zone, or the team's when they haven't set one. A teammate
  in Tokyo checks in on their Monday while London is still on Sunday.
- **Work days are the team's.** A person in another time zone keeps the
  team's work days, read on their own calendar.

## The reminder

- **One bell notice per work day**, "Time to check in", once the person's
  check-in time has come. Clicking it opens My dashboard with the check-in
  window open.
- **Never after checking in**, and never on a day the team doesn't work.
- **Late is still reminded.** A person whose time passed while the server was
  down gets the notice when it comes back, not never.
- **The bell is the only reminder.** There is no email, browser pop-up or
  Slack reminder.
- **Two passes never send two notices.** The job writes a row in
  `project_checkin_reminders` for the person and the day, in the same
  transaction as the notice. A second pass finds the row and sends nothing.

## The window

1. **From your last check-in.** Every task the person picked on their last
   check-in that isn't Done yet, with Carry over and Drop beside it. Dropping
   asks for a one-line reason. The check-in can't be saved until every one is
   answered, and pressing Check in early marks the ones still open and says
   how many. A task whose project has since been archived isn't asked about,
   because it can't be carried over.
2. **Pick today's tasks.** Every task assigned to the person that isn't Done,
   grouped by project, with due dates, steps and the "Picked on 4 days" mark.
   Tasks from the last check-in are answered above instead of listed here.
3. **Stuck.** Each task has a Stuck button that asks why, and tells whoever
   handed the task out, the same as in the task window.
4. **Add a task for yourself.** A title and a project make a task assigned to
   you, ticked straight away.
5. **Check in.** Saves the answers and the ticks as today's check-in, and
   closes the window. Closing it before then with answers or ticks in it asks
   first, because they would be lost.

## After checking in

- **My dashboard says when.** "You checked in at 9:12 AM. That was late: your
  check-in time is 9:00 AM." Late means after the person's own time, on a
  work day.
- **Picks can change all day.** "Change today's picks" opens the window
  again, where ticking or unticking a task saves at once and the window ends
  with Done.
  A task dropped this morning and ticked again later counts as carried over.
- **The morning's answers stay on show** in the window, with each drop's
  reason.

## Days off

- **No reminder, no "hasn't checked in" mark** on a day the team doesn't work.
- **A person can still check in on a day off**, and that check-in is never
  late.

## What is saved, and why

History (see [History](history.md)) reads only these rows. A task's status
today says nothing about what it was last Tuesday, so nothing is worked out
again from today's tasks.

- **`project_checkins`**: one row per person per day of their own calendar,
  with the time zone used, whether it was a work day, when they were due and
  when they checked in.
- **`project_checkin_items`**: each task picked that day (and whether it was
  carried over), and each task dropped from the last check-in with the reason.
  The task's title and project are copied onto the row, so a deleted task
  still reads as a line in history.
- **End of the day.** Once a person's day is over in their time zone, the job
  copies each pick's status onto its row (`end_status`) and marks the day
  saved. A later change to the task never touches a saved day.
- **Missed days.** Just after midnight, the same job writes a row for
  yesterday for anyone who has none, so the Team dashboard can tell a missed
  work day ("Didn't check in") from a day off. A day the job never ran on (the
  server down past midnight into the next day) has no row, and reads "Nothing
  saved for this day".
- **Someone removed from the team keeps their rows**, so a task's history
  still shows who worked on it.

## Where it lives

- **Tables:** `drizzle/0095_project_checkins.sql`.
- **Rules:** `src/server/project/checkins.ts`.
- **The two background jobs:** `src/server/project/checkin-jobs.ts`, listed as
  `project-checkins` in `src/app/server-options.ts`, on the shell's
  fifteen-second loop.
- **Endpoints:** `src/lib/api/project/checkins.ts`.
- **Screen:** `src/components/project/checkin-dialog.tsx` and
  `src/components/project/my-checkin-time.tsx`.
- **Tests:** `src/server/project/checkins.test.ts`, including the reminder
  across two time zones and two overlapping passes sending one notice.
