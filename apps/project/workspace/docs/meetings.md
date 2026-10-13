# Meetings

A team's standing meetings sit on the Team dashboard's calendar, beside the
check-ins, so a small team's week is on one page. Tyler's mockup of 10 Oct 2026
(`assets/pasted-image-1791659665679304000.png`) puts them in the middle of the
page.

## Tyler's choices, 11 Oct 2026

- **Anyone on the team makes a meeting.** Only the person who made it, the
  owner and admins can change or delete it. Everyone else gets no cog on its
  row, and the server refuses them too.
- **A meeting belongs to the team.** Everyone on the team sees it on the
  calendar, invited or not. The people invited show as their photos.
- **Repeats:** none, every week, or every 2 weeks. A repeat falls on the same
  weekday as the first day, so "Sprint retro" on Friday 2 Oct falls every other
  Friday after it.
- **The bell, once.** A person added to a meeting gets "Anna invited you to a
  meeting" with its name and next day and time, in their own time. There is no
  reminder before a meeting starts. Saving a meeting again tells only people
  newly added, and never the person saving it.
- **The video link is any https address.** The row names Google Meet, Zoom,
  Microsoft Teams, Webex and Whereby by their address, and any other link by
  its site, such as "jitsi.example.org". The link is optional.

## Making one

- **New meeting** is in the calendar panel's header. The window asks for a
  name, a colour, the day (the day picked on the calendar to start with, or
  today for a past day), Repeats, start and end times, the people, and the
  video link. Create meeting saves it.
- **A new meeting's colour** is the first one the team isn't using yet, so
  meetings tell apart without anyone choosing. It can be changed.
- **Changing or deleting** is the cog on the meeting's row under the
  calendar. It opens the same window with Delete at the left. Deleting a
  repeating meeting deletes every repeat, past and future.
- **Refused in the window, before saving:** no name, no day, an end time not
  after the start, and a link that doesn't start with `https://`. Each wrong
  field is marked invalid for a screen reader as well as drawn in red,
  including the Day button. The server checks the same, plus that every
  person is on the team.
- **At most 200 meetings per team.**
- **At most 60 meeting saves an hour per person**, counting new meetings and
  changes. Each save can ring up to 50 bells, so without the cap one person
  could make and delete meetings in a loop and fill everyone's bell. Past the
  cap the window says to wait a while.

## On the calendar

- **Each meeting is a short coloured chip** on its day, under the check-in
  counts, cut with "…" when the name doesn't fit. Past two, the square says
  "+1 more". The name is always written, so colour is never the only sign.
- **Days still to come can be clicked**, so next week's meetings can be read.
  The Check-ins tab on the right keeps showing today for a day still to come,
  and says "Wed, Oct 14 hasn't happened yet. Showing today."
- **Moving to another month picks its 1st**, or today in today's month, so
  the calendar, the meetings under it and the Check-ins tab all name the same
  day.
- **Under the calendar**, the chosen day ("Mon, Oct 12", written the same as
  in the Check-ins tab) and how many
  meetings it has, then one row per meeting: the time, the name, the service,
  how many are going ("3 going", left out while nobody is), how it repeats
  ("Every Monday") and the people's photos.
- **Clicking the row opens the meeting's window** for that date (see The
  meeting's window below). **Join** beside it opens the video link in a new
  tab in one click; on a phone it is the link icon alone. The cog changes the
  meeting, for those who may. Tyler chose this on 12 Oct 2026.

## The week view

So a busy week of meetings can be read.

- **Month and Week** is a switch in the row under the calendar's tabs. The
  choice is remembered in this browser.
- **Week shows Monday to Sunday** of the chosen day's week. Each day's
  heading has its date, its holiday, its check-in count ("4 of 6 in") and
  how many were blocked, the same as a month square.
- **Meetings sit at their times** on an hour grid that runs 8 AM to 6 PM,
  widened when a meeting starts earlier or ends later. Meetings at the same
  time share the width. Each shows its name, and its time when tall enough.
- **In the viewer's own time zone and on the viewer's own day.** A meeting
  that runs past the viewer's midnight is drawn to the end of the day it
  starts on, the same day the month view puts it on.
- **Clicking a day, or a meeting on it,** picks that day: its check-ins show
  on the right and its meetings under the calendar, where the row opens the
  meeting's window.
- **The arrows step one week**, Today comes back to this week, and moving
  into another month loads that month.
- **On a phone** the seven days stack as a list, each with its meetings and
  times in order.
- **Where it lives:** `src/components/project/team-week.tsx`, with the day
  and slot sums in `src/lib/project/week-view.ts`. The month's counts cover
  its whole grid, Monday before the 1st to Sunday after the last, so a week
  that runs into the next month still has its numbers.

## Due dates on the calendar

So an owner sees a crowded week coming.

- **"Due dates" is a switch** at the end of the row under the calendar's
  tabs. It is each person's own, off to begin with, and kept on the server,
  so it follows them to another browser.
- **On, each square names its due tasks:** the first two by title with
  their project's colour, then "+4 more". A phone's square has room for a
  count and a list icon only. The Week view adds "3 due" to each day's
  heading.
- **Under the calendar, "Due this day"** lists the chosen day's due tasks
  with their project, who has them and their status. Each row opens the
  task's window.
- **What counts:** tasks not Done, with a due date, in the shared projects I
  can see. The bin, archived projects and "Just me" lists are left out.
- **Where it lives:** `src/server/project/team-due-dates.ts` (read with the
  month by `loadTeamMonth`, the switch saved in
  `project_team_members.calendar_due_dates` from
  `drizzle/0113_project_nine_features.sql`), and the squares and list in
  `src/components/project/team-due-dates.tsx`.

## The meeting's window

Everyone on the team opens it, invited or not. It shows one date of the
meeting: the date and time in the viewer's own time, and how it repeats.
Three cards:

- **Joining.** Where the times are set, "Join on Google Meet" when there is a
  link, and Add to my calendar.
- **Who's coming.** Each invited person with Going, Not going or "No answer
  yet", and the count in the card's title.
- **Notes.** That date's notes.

The footer has **Change meeting** for the maker, the owner and admins, which
closes this window and opens the one that changes the meeting, and Done.

### Add to my calendar

- **It downloads a calendar file** (`weekly-client-call.ics`), which Google
  Calendar, Outlook and Apple Calendar all open. It holds the name, the first
  day, the start and end, the time zone, the repeat and the video link.
- **The times are written in the meeting's own zone, with that zone's clock
  changes.** So the calendar shows the meeting in each person's own time, and
  "Mondays at 10:00" in Toronto stays 10:00 in Toronto after the clocks
  change, the same as on the Team dashboard.
- **It's a one-off copy.** A meeting changed later in Project doesn't change
  in anyone's calendar, and the window says to add it again. The copy has the
  meeting's own id, so a calendar that knows it may replace the old one.
- **The file is made in the browser** from what the page already holds; the
  server isn't asked (`src/lib/project/meeting-calendar-file.ts`).

### Going or Not going

- **Each invited person answers** with the Going and Not going buttons. The
  one picked is drawn filled and is pressed for a screen reader too.
- **One answer covers every time the meeting repeats.** Answering one date of
  a repeating meeting is left out.
- **Nobody is told about an answer.** Tyler's choice on 12 Oct 2026: the maker
  reads them here and on the row.
- **Someone taken off the meeting loses their answer.** Added back, they start
  with no answer. Someone not invited, or on another team, is refused.

### Notes, and making tasks from them

- **Notes are kept per date.** A weekly meeting has a fresh page each Monday.
  The date is the one in the meeting's own calendar, so someone in Tokyo
  reading Tuesday's 8:30 AM sees the same notes as Toronto's Monday.
- **Everyone on the team reads them. Only the maker, the owner and admins
  write them**, the same people who can change the meeting. The server
  refuses anyone else, and a date the meeting doesn't fall on.
- **The editor is the one task notes use**: select words for bold, a list or
  a link. Notes save when the editor is left and when Done is pressed. "Last
  changed by Maya, 2h ago" sits under them.
- **Each line gets Make a task**, for those who write the notes, once Done is
  pressed. A line is a paragraph, a heading, each item of a list, or each
  paragraph of a quote. On a screen with a mouse the button shows on hover or
  focus; on a phone it is always there.
- **Make a task closes the meeting and opens New task** with the line as its
  title, so the person picks the project, the person and the date. Windows
  never stack. Creating it, or Cancel, opens the meeting again.
- **The made line becomes a link to the task**, with "Task made" beside it,
  and keeps its words: meeting notes record what was said, so a renamed task
  doesn't rewrite them. Someone who can't see the task's project reads the
  words without the link. A line already made into a task offers no Make a
  task.
- **A line changed by someone else meanwhile is never linked.** The server
  checks the line still has the words the person saw. If it doesn't, the task
  is still made and the person is told the line wasn't linked.
- **A task made from notes follows the project's rules**, so it can only go
  to someone on that project.

## Time zones

- **A meeting is set in the team's time zone.** The window says so: "Times are
  in America/Toronto, the team's time zone."
- **Each person sees it in their own time.** Someone who has set their own
  zone in My dashboard sees the times moved to it, the row says "your time,
  Asia/Tokyo", and the meeting sits on their own day. 10:00 PM on Monday in
  Toronto is 11:00 AM on Tuesday in Tokyo, so it shows on Tuesday there.
- **A clock change keeps the meeting's time in the team's city.** "Mondays at
  10:00" stays 10:00 in Toronto across the change, so it moves by an hour for
  someone in a city that changes on another date.
- **If the team's zone changes later**, existing meetings keep the zone they
  were set in, and their window says "where the meeting was set".

## Who sees what

- **Every endpoint checks the person is on the team that owns the meeting.**
  A meeting on another team answers "That meeting doesn't exist any more",
  the same as a deleted one.
- **Only people on the team can be invited.** Someone who later leaves the
  team drops off the meeting's photos.

## Not part of this

Syncing with Google Calendar or Outlook (Add to my calendar is a one-off
copy), reminders before a meeting, answering one date of a repeating meeting,
making the video room and recording.

## Where it lives

- **Tables:** `project_meetings` and `project_meeting_people` in
  `drizzle/0105_project_team_dashboard.sql`; `project_meeting_answers` and
  `project_meeting_notes` (one row per meeting and date) in
  `drizzle/0112_project_meetings_and_notices.sql`.
- **Rules:** `src/server/project/meetings.ts`. The repeat days, service names,
  chip colours and the month grid are in `src/lib/project/meetings.ts`, used
  by the server and the screen alike.
- **Endpoints:** `src/lib/api/project/meetings.ts`.
- **Screens:** `src/components/project/meeting-dialog.tsx` (new and
  change), `src/components/project/meeting-window.tsx` (the meeting's window)
  and `src/components/project/team-meetings.tsx`, inside the calendar panel of
  `src/components/project/team-dashboard.tsx`, which also runs Make a task.
- **Notes as lines:** `src/lib/project/meeting-notes.ts`, used by the server
  and the window alike.
- **The calendar file:** `src/lib/project/meeting-calendar-file.ts`, tested in
  `meeting-calendar-file.test.ts`.
- **Sample data:** `scripts/project-sample-data.mjs` adds Weekly planning,
  Design review, Sprint retro, a 1:1 and an All-hands.
- **Tests:** `src/server/project/team-dashboard.test.ts` and
  `src/server/project/meetings-and-notices.test.ts`.
