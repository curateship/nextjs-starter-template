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
  how it repeats ("Every Monday") and the people's photos. Clicking the row
  opens the video link in a new tab.

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
  video link and the cog changes the meeting.
- **The arrows step one week**, Today comes back to this week, and moving
  into another month loads that month.
- **On a phone** the seven days stack as a list, each with its meetings and
  times in order.
- **Where it lives:** `src/components/project/team-week.tsx`, with the day
  and slot sums in `src/lib/project/week-view.ts`. The month's counts cover
  its whole grid, Monday before the 1st to Sunday after the last, so a week
  that runs into the next month still has its numbers.

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

Syncing with Google Calendar or Outlook, making the video room, recording, and
notes from the meeting.

## Where it lives

- **Tables:** `project_meetings` and `project_meeting_people` in
  `drizzle/0105_project_team_dashboard.sql`.
- **Rules:** `src/server/project/meetings.ts`. The repeat days, service names,
  chip colours and the month grid are in `src/lib/project/meetings.ts`, used
  by the server and the screen alike.
- **Endpoints:** `src/lib/api/project/meetings.ts`.
- **Screens:** `src/components/project/meeting-dialog.tsx` and
  `src/components/project/team-meetings.tsx`, inside the calendar panel of
  `src/components/project/team-dashboard.tsx`.
- **Sample data:** `scripts/project-sample-data.mjs` adds Weekly planning,
  Design review, Sprint retro, a 1:1 and an All-hands.
- **Tests:** `src/server/project/team-dashboard.test.ts`.
