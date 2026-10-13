# Teams and invites

A team is the top level in Project. A team holds its people and its projects.
Project has no workspaces.

## One team per account

- **Each account belongs to one team.** Switching between teams is what a later
  workspace switcher would do, and version 1 doesn't build toward it.
- **Starting a team.** Anyone signed in who isn't on a team sees a "Start a
  team" card on My dashboard, Projects and Team. Whoever starts the team is its
  owner.
- **What a team holds.** A name, a daily check-in time (9:00 to begin with), a
  time zone, and its work days (Monday to Friday to begin with). Each person
  can shift the time and time zone to their own hours on My dashboard
  (see [The morning check-in](morning-check-in.md)).
- **One time-zone picker.** The team's zone, a person's own zone and a new
  team's zone use the same list you can type into: "tor" finds
  America/Toronto. The browser's zone and the team's sit at the top, and a
  saved zone the browser doesn't know is kept (`time-zone-select.tsx`).
- **A wrong value stays in its box, marked red,** until it's fixed: a check-in
  time that isn't a time, an empty label name, an empty section name. The
  error says why, and a refused save keeps what was typed too.

## Roles

- **Owner.** Exactly one per team. The owner can do everything an admin can,
  and can hand the team to someone else. Handing it over makes the old owner an
  admin. The owner can't leave until someone else is the owner.
- **Admin.** Invites people, removes people, changes roles between admin and
  member, and edits the team's settings. An admin can't change or remove the
  owner.
- **Member.** Works on projects. Anyone, whatever their role, can make
  projects and tasks and hand tasks to anyone on the project.

## Invites

- **An invite is for one email address.** Only an account signed in with that
  address can accept it. The link expires after 7 days.
- **The link carries a secret.** The database only stores a fingerprint of the
  secret (a sha256 hash), so someone reading the database can't accept an
  invite with what they find there.
- **Inviting the same address again** replaces the old invite and its link.
  Resend on the Team dashboard does the same with a fresh link and 7 more days.
- **Several addresses at once.** The invite window's "Email addresses" box
  takes one address, or up to 20 on separate lines or with commas,
  semicolons or spaces between them (Tyler chose 20 on 13 Oct 2026, inside
  the 30 an hour below). "Ann <ann@x.com>" as copied from an email works.
  Repeats are dropped and every address is lower-cased. All of them get the
  one role picked. The button reads "Send 7 invites".
- **One address behaves as it always has**, including replacing an open
  invite. With several, each goes through the same checks one at a time
  (`createInvites` in `src/server/project/invites.ts`), and the window then
  lists each address: Emailed, not emailed with the reason, already on the
  team, already invited, not an email address, or not sent because of the
  sending cap (30 an hour, or 5 a day to one address). An address with an open invite is left alone in a send of
  several, because a new link would quietly stop the old one; Resend on
  Members does that on purpose. Each sent invite has a Copy link button.
- **More than 20** is refused before anything is sent, saying how many were
  pasted. Hitting the hourly cap partway sends the ones before it and marks
  the rest to send again later.
- **Email.** The invite goes through the email key saved in Settings → Email, or
  the `CUSTOM_SHELL_RESEND_API_KEY` setting. When neither is set, nothing is
  sent, and the invite window says so and shows the link to copy. The link is
  always shown, so it can be shared by hand either way.
- **The invite window's heading says what happened:** "Emailed to
  leo@example.com", "The email didn't go out" with the refusal under it, or
  "Email isn't set up". Settings → Email is only named to an app admin, the
  one person who can open it; a team owner is told to send the link
  themselves.
- **How often invites can be sent.** Each person can send 30 invite emails an
  hour, and one address can receive at most 5 a day from all teams together.
  Resend counts too. The cap exists because anyone can start a team, so without
  it an invite would be a way to make Project email any address as often as
  someone liked. A refused send says to wait an hour.
- **Why invites skip the shell's system emails.** Adding an email type to the
  shell's list means editing shell files, which an app never does. The invite
  is sent with the same lower-level sender the CRM uses
  (`src/server/project/invite-email.ts`).
- **Two ways to accept.** The emailed link opens `/projects/invite/<secret>`.
  A signed-out visitor is sent to sign in and brought back. A brand-new account
  doesn't come back to the link, because `/register` doesn't remember where you
  were going. So any open invite to your address also shows at the top of the
  Projects page, with Join and Decline. Decline asks first: "Decline the
  invite to Acme? You'd need a new invite to join."
- **Joining lands on My dashboard**, by invite or by join link alike.
- **Starter tasks.** Each person who joins, either way, gets the team's
  starter tasks (see Team settings) as their own "Just me" tasks, handed out
  by the owner, with one notice: "Anna gave you 3 tasks". They arrive
  accepted rather than Waiting, because the owner can't open a "Just me" task
  to take one back. People already on the team get nothing.
- **Someone already on a team** sees the invite with "Leave your current team
  to join this one", and Join is refused until they leave. The invite and
  join pages say "Leave it from the Members page first" with an Open Members
  button.

## The join link

One link to paste in a message, instead of inviting people one by one.

- **The owner and admins turn it on** in Team settings. Anyone signed in who
  isn't on a team can then join as a member through it, straight away, with
  no approval (Tyler's choice, 10 Oct 2026).
- **Shown once.** Like an invite, only a fingerprint (sha256) of the link's
  secret is kept, so the link is shown when it is made and never again.
  "Make a new link" replaces it, and the old one stops working at once. "Turn
  it off" stops it too. Both ask first, inside the card rather than in a
  window over Team settings: "Make a new link? The old one stops working at
  once." Turning the link on from off doesn't ask.
- **It works for 7 days.**
- **Against a leaked link:** at most 20 people a day can join through one
  link, and the owner and admins get "Leo joined the team through the link" in
  the bell each time.
- **Someone already on a team** is refused with the reason, as with invites.
- **The page** is `/projects/join/<secret>`. A signed-out visitor is sent to
  sign in and brought back.

## Job titles

- **A short title beside each name**, up to 40 characters, such as
  "Copywriter": on the Team dashboard's member list, the Members page, each
  project's members, the Workload tab and the hand-to picker in a task.
- **Each person sets their own** on My dashboard's left panel. **The owner and
  admins can change anyone's** from that person's page, opened from the
  Members page or the Team dashboard.
  Both say Saving…, then Saved or Not saved, beside the field.

## Removing people

- **Removing someone or leaving** takes the person off every project in the
  team, then off the team. They lose access at once.
- **Their tasks stay.** Each task they were assigned to is left with nobody
  assigned and a note of whose it was, such as "Nobody (was Ben)".
- **Their check-ins stay**, so task history still shows the days they worked
  on a task. They no longer appear on the Team dashboard (see
  [History](history.md)).

## Handing over all of someone's tasks

For when someone leaves or goes away, so their work isn't left with nobody.

- **"Hand over all tasks"** is on each row of the Members page, and in the
  remove-member window ("Hand over their tasks first"), for the owner and
  admins. Pick who receives them.
- **Every task of theirs that isn't Done** goes to the receiver, who has to
  accept each one, as with any hand-over. Each writes its history line.
- **One notice**, "Anna gave you 9 tasks", opens the receiver's My dashboard,
  rather than nine.
- **Projects the receiver isn't on.** Those tasks are left with nobody
  assigned ("Nobody (was Ben)") and listed in the window with the reason,
  "isn't on the project" or "isn't on these projects". The window keeps the
  person's name while it closes. The
  receiver is never added to a project (Tyler's choice, 10 Oct 2026).
- **Left alone:** tasks in archived projects and "Just me" tasks.

## The Team dashboard

`/team` is three panels, from Tyler's mockup of 10 Oct 2026
(`assets/pasted-image-1791659665679304000.png`). The panels resize and
collapse like the project page's, and below 1280px wide one shows at a time,
under Calendar, Team and Day tabs. Picking a day on the calendar switches to
Day. The tab is "Day" so it doesn't sit over the panel's own Check-ins tab.

- **Left: the team.** The team photo, its name, the day it was created and its
  time zone, the four figures, the check-in schedule ("Daily at 9:00 AM,
  Toronto time" and the work days, M T W T F S S, the work days filled in),
  and the members with
  their roles. The owner and admins also get an Invite member button. Manage
  opens the Members page.
- **Middle: Calendar and Activity tabs.** Tyler put Activity here on 12 Oct
  2026, because the right panel's three tabs already fill it. Calendar is
  the team's announcement pinned at the top when there is one (below), then
  a month, or a week, of the team's check-ins and meetings, with the chosen
  day's meetings under it. The month's name, the arrows, Today and the
  Month and Week switch sit in a row under the tabs; the megaphone and New
  meeting stay in the header. The tab and the Month or Week choice are
  remembered in this browser. See [Meetings](meetings.md),
  [History](history.md#past-days-on-the-team-dashboard) and The team's
  Activity below.
- **Right: three tabs.** Check-ins: one day's check-ins, today to start with,
  with arrows to step through the days, and "Away" for anyone on time off (see
  [History](history.md#past-days-on-the-team-dashboard)).
  - **Times read in your own clock.** "Checked in 4:02 AM" for a London
    teammate's 9:02 check-in, read in Toronto, the way meetings already read.
    Only the time moves: late is still judged on the teammate's own clock and
    check-in time, and they stay on their own day.
  - **A day nobody is expected** reads "A day off for the team." with no bar,
    instead of "0 of 0 checked in". A day with nothing saved at all, such as
    one before the team began, reads "Nothing was saved for this day."
  - **A day still to come** shows today, and says so: "Wed, Oct 14 hasn't
    happened yet. Showing today." Workload, for
  everyone, and Needs attention, for the owner and admins (see
  [Needs attention and workload](needs-attention.md)). The tab last used is
  remembered in this browser.

### The team's Activity

What moved today, without opening every project.

- **The same lines as a project's Activity tab** (see
  [Projects and tasks](projects-and-tasks.md#activity)), across every
  project the viewer can see, newest first, 50 at a time with "Show older".
  Each line names its project beside the time.
- **Only what the viewer can see.** The owner and admins see every shared
  project; a member sees their own projects. A line from a project the
  viewer isn't on never shows. "Just me" tasks never show, not even the
  viewer's own, and neither does a task in the bin.
- **A line opens its task** as a window over the dashboard, as the rest of
  the Team dashboard does.
- **Where it lives:** `loadTeamActivity` in
  `src/server/project/project-activity.ts`, drawn by `TeamActivity` in
  `src/components/project/project-activity.tsx`.

### The team's announcement

Something for the whole team reaches everyone in one place: "Office closed
Friday", pinned at the top of the Team dashboard's middle panel.

- **The owner and admins post it.** The megaphone in the calendar's header
  opens a window with one box, up to 500 characters, and Post announcement.
  While one is up, "Post a new one" on it opens the same window.
- **Everyone else on the team gets "Maya posted an announcement"** in the
  bell, with the start of it under the heading. It opens the Team dashboard.
- **One at a time.** A new one replaces the old one and rings the bell again.
  Take down removes it for everyone, after "Take it down for everyone?".
- **Each person can hide it for themselves** with the X. It stays hidden for
  them until the next one is posted, which shows again.
- **It shows who posted it and when**, with the exact time on hover.
- **It is one message, never a team chat.** Nobody replies to it. Talk about
  a project goes in that project's chat (see
  [Projects and tasks](projects-and-tasks.md#the-projects-chat)).
- **20 an hour at most per person**, since each one rings everyone's bell.
- **"Read by 4 of 6"** sits under it for the owner and admins only. Pressing
  it lists who has seen it and who hasn't yet, with their photos. Everyone on
  the team now counts, whenever they joined. Seeing it on the Team dashboard
  counts once, hiding it counts, and whoever posted it has read it. The
  person looking always counts as having seen it. A new announcement starts
  again at nobody. Members never see the names, so nobody is watched by
  their peers.
- **Where it is saved:** on `project_teams` (`announcement_id`, `_text`,
  `_by_user_id`, `_at`), and who hid which one on `project_team_members`
  (`hidden_announcement_id`), in `drizzle/0109_project_chat_and_talking.sql`.
  Who has seen each one is `project_announcement_views`, one row per person
  per announcement, in `drizzle/0113_project_nine_features.sql`.
  Rules in `src/server/project/announcements.ts`, the card and window in
  `src/components/project/team-announcement.tsx`.

### The team photo

- **The owner and admins add it** by clicking the box at the top of the left
  panel, which opens the shared media library to upload or pick a picture
  (Tyler's choice, 11 Oct 2026). The red X on its corner takes it away.
- **Everyone else sees the photo**, or nothing when there isn't one.
- **The server only takes a picture the person uploaded themselves**, so
  nobody can point the team at another person's file or at an address outside
  the library. A file the library refuses (too big, or not a picture) says why
  in the upload window.
- **If the picture is later deleted from the library**, the panel shows
  nothing rather than a broken picture.

### The four figures

A 2 by 2 grid under the team's name (`src/server/project/team-figures.ts`).
Tyler chose what each counts on 11 Oct 2026.

- **Members**, with how many invites are still waiting and not expired, such
  as "1 pending invite".
- **Open tasks**: tasks not Done in projects the viewer can see, leaving out
  "Just me" lists, the bin and archived projects. So two people can read
  different numbers. Under it, how many of those are due this week, Monday to
  Sunday.
- **Completed this week**: tasks marked Done since Monday in the viewer's own
  time zone, in the same projects. It reads the time a task became Done
  (`completed_at`), which is cleared when it leaves Done, so marking a task
  Done and back takes it off again.
- **Check-in rate** over the 7 days before today, such as "93%" and "26 of 28 ·
  last 7 days". It counts the saved check-ins the way the calendar's squares
  do: work days only, time off left out, and a late check-in still counts.
  Today is left out because people still have time to check in.

### Trends

"Trends, last 12 weeks", under the four figures, opens a window with two
small bar charts, week by week, Monday to Sunday, this week so far on the
right:

- **Check-in rate**, counted the way the figure counts it: work days only,
  time off left out, a late check-in still counts, and today left out.
- **Tasks finished**, counted the way Completed counts them: marked Done that
  week, still Done, in projects the viewer can see, leaving out "Just me"
  lists and the bin. This week's bar is the Completed figure.
- **Team totals only, never by person.** Tyler said the check-in isn't for
  watching people, so there is no breakdown by person anywhere in it.
- **Hovering a bar** gives the week's dates and its numbers ("86%, 26 of
  30"). A week with no work days reads "No work days". A screen reader gets
  the same numbers as a table.
- **Where it lives:** `loadTeamTrends` in `src/server/project/team-figures.ts`,
  the window `src/components/project/team-trends-dialog.tsx`, drawn with the
  shell's shared chart card and chart parts.

### Check-in notes on the Check-ins tab

- **Each person's three notes** from their check-in show under their name:
  "Yesterday · Still blocked on email provider", "Today · Work on members
  table", and in red "Blocker · SendGrid key still pending".
- **The picked tasks sit under each note** in a small grey line (Tyler's
  choice, 11 Oct 2026). With no note, the picked tasks are the line, as before.
- **A Blocker note marks the person Blocked**, the same as a picked task
  that is Stuck, which still shows its own red line. Both count in "1 blocked".
- **Notes show to everyone on the team.** They are the person's own words.
  A picked task's title still shows only to people on its project.
- **Under the team's own words**, if it renamed the boxes, and a tag shows as
  the person's name in the primary colour.
- See [The morning check-in](morning-check-in.md#notes-for-the-team).

### Answering a blocker

So a blocker gets help where it was written, not in a side chat.

- **Reply** sits under each Blocker note and each Stuck line, on today and
  past days, and never under someone without a blocker. It opens one line,
  up to 280 characters. The reply shows under the blocker with the replier's
  photo and how long ago.
- **Who can reply** (Tyler's choice, 11 Oct 2026): anyone on the team to a
  Blocker note; only people who can see a Stuck task's project to that task,
  because its title is private to them. Everyone else doesn't see that
  task's replies either.
- **The blocked person gets "Maya answered your blocker"**, one notice per
  reply, opening the Team dashboard on that day. Replying under your own
  blocker tells nobody.
- **A reply to a Stuck task also goes into the task's chat**, so the answer
  stays with the task. The blocked person still gets the one notice, not also
  "commented on a task".
- **One line each, never a thread.** There's no reply to a reply. A person can
  write 60 replies an hour, so nobody can flood the bell.
- **Where it lives:** `project_blocker_replies`,
  `src/server/project/blocker-replies.ts`,
  `src/components/project/blocker-replies.tsx`.

### Thanks on the Check-ins tab

- **One small line per person**: "Thanked by Maya for Build the contact
  form, Anna for a task". A task the reader can't see, or a "Just me" task,
  reads "a task".
- It counts the thanks they got that day, on their own calendar. See Thanks
  in [Projects and tasks](projects-and-tasks.md#thanks).

### Team settings

The cog in the left panel's header opens the Team settings window: name,
daily check-in time, time zone and work days, the check-in boxes' names, team
holidays, starter tasks and the join link (owner and admins only), the
team's labels (see [Labels and sections](labels-and-sections.md)), and its
saved step lists, which the owner and admins rename and delete there and
everyone else sees as a list (see
[Projects and tasks](projects-and-tasks.md#tasks)).

- **Check-in boxes**: rename the three notes, such as "Wins" and "Focus".
  Empty keeps the usual word. See
  [The morning check-in](morning-check-in.md#the-teams-own-words-for-the-boxes).
- **Team holidays**: a date and a name, today or later. See
  [Team holidays](morning-check-in.md#team-holidays).
- **Starter tasks**: up to 10 titles each new member gets as "Just me" tasks.
  The card says these are private, so whoever runs the team won't see
  whether they're done (Tyler's choice, 11 Oct 2026). Members don't see this
  card. Each field saves when it is
left or picked, so the window ends with Done, and the top of the window says
Saving…, then Saved or Not saved (see
[Fields that save themselves](fields-that-save-themselves.md)). Closing it with
Escape or a click outside saves the field being typed in too. The owner and admins edit;
everyone else sees the same window to read. Tyler first asked for these in
Settings → App settings, then chose the window, because Settings only opens
for app admins and a customer who owns a team is not one.

### A teammate's page

Clicking anyone on the Team dashboard's member list, their row on the
Members page, or the name or photo on their chat message opens their page as
a window. Tyler asked for the chat on 13 Oct 2026. In a chat inside a task's
window (opened from the Team dashboard) the name stays plain, since a window
never opens on top of another. It answers "what's Ben on this
week?" in one click.

- **Open tasks:** theirs that aren't Done, soonest due first and undated
  last, each with its project, due date and status. Only shared projects I
  can see count: a task in a project I'm not on, a "Just me" task and an
  archived project never show. Each opens on its project page.
- **Time off** that hasn't ended yet. The owner and admins can add and
  remove it here; everyone else reads the dates.
- **Job title and role.** The owner and admins change the role and the job
  title here, and the owner can hand the team over. "Hand over all their
  tasks" closes the window and opens the hand-over (see
  [Handing over all of someone's tasks](#handing-over-all-of-someones-tasks));
  it doesn't show on my own page.
- **Never a way to watch someone** (Tyler, 13 Oct 2026). It shows only what
  the app already shows elsewhere. Their check-in record ("On time 18 of the
  last 20 work days") stays theirs alone, as
  [My dashboard](my-dashboard.md) promises.
- **Where it lives:** `loadTeammate` and `loadTeamMember` in
  `src/server/project/teammate.ts`, the chat's way in through
  `src/components/project/person-pages.tsx`,
  and the window in `src/components/project/member-dialog.tsx`, which used
  to hold only the role.

### The Members page

`/team/members`, opened from Manage:

- **Members.** Everyone on the team with their job title, role and the date
  they joined. Clicking a row opens that person's page (above).
  The owner and admins change roles from the Settings button and remove people
  from the Delete button, one at a time or several at once. Searching clears
  the ticks, so Remove never acts on someone the search has hidden. An empty
  job title is a blank cell.
- **Pending invites.** Only the owner and admins see this table. Each row can
  be sent again or cancelled. Resend's hover label says "Resend the invite.
  The old link stops working." before it's pressed, and Cancel waits while a
  resend runs.
- **Leave team.** Everyone but the owner sees it at the bottom.

## Where it lives

- **Rules:** `src/server/project/teams.ts` and `src/server/project/invites.ts`,
  with handing over, the join link, job titles, Needs attention and workload
  in `src/server/project/team-running.ts`.
- **Tables:** the join link and job titles in
  `drizzle/0104_project_running_the_team.sql`, the team photo in
  `drizzle/0105_project_team_dashboard.sql`, and the boxes' names, starter
  tasks, holidays and blocker replies in
  `drizzle/0106_project_checkin_and_handing_out.sql`.
- **Starter tasks:** `src/server/project/starter-tasks.ts`, given out from
  `acceptInvite` and `joinTeamByLink`.
- **The four figures:** `src/server/project/team-figures.ts`, drawn by
  `src/components/project/team-figures.tsx` with the team photo.
- **Who may do what:** `src/server/project/access.ts`.
- **Screens:** `src/components/project/team-dashboard.tsx`,
  `src/components/project/team-settings-dialog.tsx` with the check-in cards
  in `team-checkin-settings.tsx`,
  `src/components/project/team-members.tsx` and
  `src/components/project/team-start.tsx`.
- **Tests:** `src/server/project/project.test.ts`, the figures and photo
  in `src/server/project/team-dashboard.test.ts`, and the announcement in
  `src/server/project/chat-and-talking.test.ts`.
