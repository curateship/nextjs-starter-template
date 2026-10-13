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
- **Due dates ride on the same time.** "Due tomorrow" and "Overdue" reach the
  person assigned at their own check-in time, on work days (see Bell notices
  in [Projects and tasks](projects-and-tasks.md)).

### The team's morning

- **One notice per work day** to the owner and each admin: "5 of 6 checked
  in, 1 blocked", or "5 of 6 checked in" when nobody is blocked. Clicking it
  opens the Team dashboard on that day.
- **Its second line names who isn't in yet**: "Not yet: Ben Tester, Carla
  Tester." Past three names it ends "and 2 more". With everyone in it says
  "Everyone's in." People on time off aren't named, because they aren't
  expected.
- **It waits for the last person.** It goes 30 minutes after the latest
  check-in time anyone in the team has, so every number is in. Tyler chose
  this over the owner's own time plus an hour on 10 Oct 2026. A team spread
  across time zones may get it late in the owner's day.
- **The numbers are the calendar's.** They are counted by the same code as
  today's square on the Team dashboard (`countTeamToday` in
  `src/server/project/team-days.ts`). The day is the team's, in the team's
  time zone.
- **Nothing on a day the team doesn't work.**
- **Sent once.** The job writes a row in `project_team_morning_notices` for
  the team and the day, in the same transaction as the notices.
- **Who is blocked, and why, is on the Team dashboard.** The notice only
  counts them.
- **Older notices still open.** Notices sent before 11 Oct 2026 read
  "5 of 6 checked in, 0 blocked" over "The team's check-ins today." The bell
  recognises both wordings (`TEAM_MORNING_WORDS` in
  `src/lib/project/notices.ts`).

## The window

1. **From your last check-in.** Every task the person picked on their last
   check-in that isn't Done yet, with Carry over and Drop beside it. Dropping
   asks for a one-line reason. The check-in can't be saved until every one is
   answered, and pressing Check in early marks the ones still open and says
   how many. A task whose project has since been archived isn't asked about,
   because it can't be carried over. **Carry all over**, above the list,
   answers every one still open with Carry over in one press; drops already
   written stay as they are. Each still shows its "Picked on 4 days" mark, so
   a task carried over without thinking still shows up.
2. **Pick today's tasks.** Every task assigned to the person that isn't Done,
   grouped by project, with due dates, steps and the "Picked on 4 days" mark.
   Tasks from the last check-in are answered above instead of listed here.
   Before checking in, up to five of them come first under "Suggested for
   today", each naming its project. See "Suggested for today" below.
3. **Stuck.** Each task has a Stuck button that asks why, and tells whoever
   handed the task out and its followers, the same as on the task itself.
4. **Add a task for yourself.** A title and a project make a task assigned to
   you, ticked straight away.
5. **Notes for the team.** Three short boxes, Yesterday, Today and Blocker
   unless the team has renamed them, each up to 280 characters. See below.
6. **Check in.** Saves the answers, the ticks and the notes as today's
   check-in, and closes the window. Closing it before then with answers,
   ticks or notes in it asks first, because they would be lost. So does a
   task title or a Stuck reason typed but not yet added, before and after
   checking in. Escape, the X, Cancel and Done all ask the same way.

### Suggested for today

- **Nothing starts ticked** (Tyler's choice, 13 Oct 2026). The group only
  puts the likely picks first, so picking stays the person's own choice.
- **The order:** past its due day, then due today, then already in Doing,
  then High priority. Ties go to the earlier due day, then the project's own
  order. A task that is none of these isn't suggested.
- **Never suggested:** a Stuck task, a task waiting on other tasks that
  aren't Done, and a task handed over but not yet accepted. Snoozed and
  binned tasks are already out of the check-in.
- **At most five.** The task asked for the team's Doing limit, but that
  limit is set per project (`doing_limit` on a project), so there is no one
  number for a person's day. Five is fixed in `SUGGESTED_PICKS`.
- **Listed once.** A suggested task leaves its project's group. Tasks the
  last check-out planned and tasks from the last check-in keep their own
  places and are never suggested.
- **Only before checking in.** Once checked in, the window lists every task
  under its project again (`suggestPicks` in
  `src/lib/project/suggested-picks.ts`).

### Notes for the team

- **Optional** (Tyler's choice, 11 Oct 2026). Checking in still needs nothing
  but the answers to the last check-in's tasks.
- **In the person's own words**, for what a list of task titles can't say,
  such as why someone is blocked. Everyone on the team reads them beside the
  check-in on the Team dashboard, including people outside the person's
  projects.
- **A Blocker note marks the person Blocked** on the Team dashboard, alongside
  any picked task that is Stuck (Tyler chose both, 11 Oct 2026).
- **Changeable during the day.** After checking in, the boxes stay in the
  window and save themselves 700ms after the last key, and at once when a box
  is left or the window shuts. The card's header says Saving…, Saved or Not
  saved. An empty box saves as no note.
- **Only today's.** Once the day is over, its notes stay as they were.
- **Yesterday starts from last evening's check-out.** If the person checked
  out with a "What's left" note, the Yesterday box opens with it, for them to
  change or clear. Leaving it as it is doesn't count as typing, so closing the
  window doesn't ask first.
- **With no check-out, Yesterday lists what the person finished.** The box
  opens with the title of each task assigned to them that became Done since
  their last check-in, one per line, oldest first (Tyler's choice, 13 Oct
  2026: since the last check-in, so a Monday covers the weekend). A task
  moved back out of Done, a task in the bin and a task in a project they can
  no longer see are left out. It names at most ten and ends "and 15 more",
  and it stops sooner when the next title would take the note past 280
  characters. A first check-in, and a check-in after nothing was finished,
  start empty (`finishedSinceLastCheckin` in `checkins.ts`).

### Tagging someone in a note

- **Typing @ in any of the three boxes lists the team's members**, the same
  list as a task's chat (`tag-textarea.tsx`, shared by both). Anyone on the
  team can be tagged, because everyone on the team reads the notes.
- **A tagged person gets "Leo mentioned you in their check-in"**, with the
  note under it, and it opens the Team dashboard on that day.
- **One notice per person per note.** Tagging the same person in two boxes
  sends two. Tagging yourself sends nothing.
- **Only once the box is left.** The notes save themselves 700ms after the
  last key, so a name half typed could otherwise reach the wrong person. Those
  saves tell nobody; leaving a box, closing the window, or checking in does.
- **Editing tells only the newly tagged**, the chat's rule. Who each note
  tagged is kept in `project_checkin_mentions`.
- **Saved in the chat's format**, `@[Leo Park](<user id>)`, and drawn as the
  person's current name on the Team dashboard. Tagging someone off the team
  is refused: "You can only tag people on your team."

### The team's own words for the boxes

- **The owner and admins rename the boxes** in Team settings, under
  "Check-in boxes", such as "Wins" and "Focus". Tyler chose renaming only on
  11 Oct 2026: there are always three boxes.
- **The third box still marks someone Blocked**, whatever it is called.
- **The saved columns keep their names.** Only the words on screen change.
- **Past days read under the words of their day.** Each check-in saves the
  three words it was made under (`question_labels`). Days from before
  11 Oct 2026 have none and read Yesterday, Today and Blocker, the words in
  use then. An empty box in Team settings goes back to the usual word.

### Snoozed and Just me tasks

- **A snoozed task stays out of the pick list** until the person's own
  morning of its date. A task picked on the last check-in still has to be
  carried over or dropped, snoozed or not, so nothing is let go silently.
- **"Add a task for yourself" offers "Just me"** beside the projects, for a
  task only that person can see.

## The evening check-out

Optional, and private to the person. Tyler's rule in
[What this app is](what-this-app-is.md): "The evening check-out is optional".

- **Check out** sits beside "Change today's picks" on My dashboard once the
  person has checked in. It opens a window (`?checkout=true`).
- **Today's picks are listed with their status.** Ticking one marks it Done
  when the person presses Check out, one task at a time as from the task
  itself, so each writes its history and sends its notices. A task already
  Done shows ticked and can't be unticked here.
- **All or nothing.** If one ticked task can't be marked Done, for example
  because it went in the bin since the morning, the check-out says why and
  saves nothing, so no task is left half finished (`checkOut` in
  `src/server/project/checkins.ts`).
- **Plan your next check-in.** Every open task of mine is listed to tick.
  The next check-in opens with them already ticked, and I can still change
  them there; a line says how many came from my check-out. A task ticked
  Done for today can't also be planned.
- **The plan waits for my next check-in, whenever it is.** A check-out on
  Friday plans Monday, and a day off or a weekend in between changes
  nothing. A planned task finished, handed to someone else or put in the bin
  meanwhile drops off quietly. Only my own open tasks can be planned.
- **"What's left"**: one note, up to 280 characters, which starts the next
  check-in's Yesterday box.
- **It can be changed until the day ends.** The button then reads "Change
  check-out", and My dashboard says "You checked out at 5:31 PM."
- **Never needed.** Checking in tomorrow works the same without it.
- **Nobody else sees it** (Tyler's choice, 11 Oct 2026). The Team dashboard
  never shows a check-out or its note, nothing counts who hasn't checked out,
  and no reminder of any kind exists for it.

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
- **The notes can change all day**, as above.
- **Today's picks have my own order.** On My dashboard's Today tab rows drag
  into the order the person plans to work them, saved on today's check-in
  lines (`position` on `project_checkin_items`). Nobody else's view changes:
  the project's own order is untouched. A task added later in the day goes to
  the bottom. The next morning, carried-over tasks keep the last check-in's
  order, followed by new picks in the order ticked.

## Days off

- **No reminder, no "hasn't checked in" mark** on a day the team doesn't work.
- **A person can still check in on a day off**, and that check-in is never
  late.

## Team holidays

A public holiday is a day off for everyone, set once.

- **The owner and admins add them** in Team settings under "Team holidays":
  a date and a name, such as "Christmas Day". Today or later only. Removing
  one asks first.
- **On that date nobody is reminded**: no check-in reminder, no "Due
  tomorrow" or "Overdue", and no morning notice to the owner.
- **Saved as a day off.** The end-of-day job saves the day with `work_day`
  false, so nobody shows "Didn't check in" and the check-in rate leaves the
  day out.
- **The calendar square reads the holiday's name**, and the Check-ins tab
  says "Christmas Day, a team holiday."
- **The date is read on each person's own calendar**, the same way the team's
  work days are. A person in another country marks their own country's
  holidays as time off.
- **Days already saved don't change**, the same rule as time off.
- **Checking in on a holiday is allowed** and is never late.
- **Where it lives:** `project_team_holidays`, rules in
  `src/server/project/holidays.ts`, the card in
  `src/components/project/team-checkin-settings.tsx`.

## Time off

A person's own days off, such as a holiday, so they don't count as missed.

- **Each person marks their own** on My dashboard's left panel, with a first
  and last day. **The owner and admins can mark anyone's**, from that
  person's window on the Members page. Tyler chose both on 10 Oct 2026. Up
  to a year at a time.
- **No reminder** on those days of the person's own calendar, and no due-date
  reminders either.
- **Saved as a day off.** The end-of-day job saves the day with `work_day`
  false, not "Didn't check in".
- **"Away" on the Team dashboard**, and they aren't counted as expected that
  day: not in the calendar square, not in the owner's morning notice.
- **Days already saved don't change.** A day saved as "Didn't check in"
  before the time off was added stays that way.
- **Checking in while away is allowed**, and is saved as a day off, so it is
  never late.
- **The card says what it's doing.** A loading line while it reads, Try
  again when the read fails, and a spinner on Save time off while it saves.
- **Taking time off away asks first**: "Remove time off for Oct 14, 2026 to
  Oct 16, 2026?", on My dashboard and in a teammate's window alike.
- **Where it lives:** `project_time_off` in
  `drizzle/0103_project_time_off.sql`, rules in
  `src/server/project/time-off.ts`, the screen in
  `src/components/project/time-off-card.tsx`.

## What is saved, and why

History (see [History](history.md)) reads only these rows. A task's status
today says nothing about what it was last Tuesday, so nothing is worked out
again from today's tasks.

- **`project_checkins`**: one row per person per day of their own calendar,
  with the time zone used, whether it was a work day, when they were due,
  when they checked in, and the three notes (`note_yesterday`, `note_today`,
  `note_blocker`, from `drizzle/0105_project_team_dashboard.sql`). From
  `drizzle/0106_project_checkin_and_handing_out.sql` it also keeps the words
  the boxes had that day (`question_labels`), and the private check-out
  (`checked_out_at`, `note_left`). The tasks the check-out planned for the
  next check-in are `tomorrow_task_ids`, from
  `drizzle/0113_project_nine_features.sql`; null when nothing was planned.
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

- **Tables:** `drizzle/0095_project_checkins.sql`, the reminder claims in
  `drizzle/0098_project_reminders.sql`, and tags, holidays, the check-out
  and my own order in `drizzle/0106_project_checkin_and_handing_out.sql`.
- **Rules:** `src/server/project/checkins.ts`, with tags in notes in
  `checkin-mentions.ts` and holidays in `holidays.ts`.
- **The two background jobs:** `src/server/project/checkin-jobs.ts`, listed as
  `project-checkins` in `src/app/server-options.ts`, on the shell's
  fifteen-second loop.
- **Due-date reminders and the team's morning:**
  `src/server/project/reminder-jobs.ts`, listed as `project-reminders`.
- **Endpoints:** `src/lib/api/project/checkins.ts`.
- **Screen:** `src/components/project/checkin-dialog.tsx`,
  `src/components/project/checkout-dialog.tsx` and
  `src/components/project/my-checkin-time.tsx`.
- **Tests:** `src/server/project/checkins.test.ts`, including the reminder
  across two time zones and two overlapping passes sending one notice, the
  notes in `src/server/project/team-dashboard.test.ts`, and tags, the
  check-out, renamed boxes, my own order and holidays in
  `src/server/project/checkin-and-handing-out.test.ts`.
