# Teams and invites

A team is the top level in Project. A team holds its people and its projects.
Project has no workspaces.

## Who is who

Tyler, 16 Oct 2026: "I think this needs to be a shell change. We'd have
admin, pro, free and other types of users such as employee". So Project has
two kinds of people, both ordinary shell accounts signing in on the one
`/login`:

- **Employees** do the work. Their account has Project's own `employee` role,
  declared in `roles` in `src/app/options.ts` (see the shell's
  `docs/accounts/app-roles.md`). An employee gets none of the shell's member
  features: no Billing, plan or Upgrade, no AI usage, Feedback, Changelog or
  workspaces. Their Account window holds their name, photo and password, and
  Security has the password and "sign out other devices" only. Their left menu
  is Project's: My dashboard, Projects, Team and Task types.
- **The site admin** runs every team without being on any. It is the shell's
  `admin` role. Tyler: "Im admin, I should be able to see everything" and
  "What tasks? if i only overseeas the team, why would I get tasks?" The site
  admin is in no member list or count, has no "Just me" list
  and no check-in, and My dashboard sends them to the Team dashboard. They
  can take a task on any project themselves without joining it (Tyler,
  19 Oct 2026: "I should be able to assign myself (admin)"). They then show
  as "Admin (you)" in Assigned to, the List's members dropdown and New task,
  only to themselves; nobody else can hand them a task, and a task of theirs
  moved to another project stays theirs. The rule is `requireAssignable` in
  `src/server/project/tasks.ts`.

## Teams

- **An employee belongs to one team.**
- **Only the site admin makes teams**, from New team on the Teams dashboard,
  or the "Start a team" card while there are none. The server refuses anyone
  else. An employee who isn't on a team sees "Not on a team yet. The site
  admin puts you on a team."
- **There is no team dropdown.** Tyler, 19 Oct 2026: "There should be a team
  dashboard to create, edit and delete teams and there should be no team
  dropdown in the navigation. Admin sees all project." A saved pick decided
  which team every page showed, and an agent's browser check once left it on
  an empty team, so every project seemed gone.
- **The Teams dashboard** (`/teams`, "Teams" in the site admin's left menu;
  an employee's link stays "Team", their own team at `/team`) lists every
  team by name: People, Projects (open, then archived), Check-in time and
  zone, and Actions with a cog and a bin. New team sits in its header. A row
  opens that team's own dashboard at `/teams/<id>`, with Members at
  `/teams/<id>/members`. The cog opens the team's settings window, the same
  one its dashboard opens, kept in the address (`/teams?settings=<id>`) so
  each change made in it shows straight away. The site admin landing on `/team` or My dashboard
  goes to `/teams`.
- **Each page names its team.** A project's page uses the project's team, and
  a team's page the team in its address, sent with every request it makes
  (`inTeam` in `src/server/project/access.ts`, `TeamScope` in
  `src/lib/project/team-scope.tsx`). Two tabs on two teams never mix.
  Employees have one team and send nothing.
- **Deleting a team.** The bin asks "Delete Beta?" and the team goes for good
  with everything left in it: archived projects and their tasks, "Just me"
  lists, check-ins, meetings, labels, task types, templates, step lists, days
  off and saved views. It is refused while anyone is on the team or a shared
  project is still open: the window says "Sample team can't be deleted yet",
  names what is left, and links to Members and to Projects filtered to that
  team (Tyler chose this over a delete that takes live work, 19 Oct 2026).
  Uploaded files such as the team photo stay in storage.
- **A notice meant for the site admin opens the right team.** A link to a
  team page goes to that team's own page, `/teams/<id>?day=…`
  (`onTeamHref` in `src/lib/project/notices.ts`). Notices made before 19 Oct
  2026 point at `/projects/team/<id>?to=<page>`, which now opens the page
  straight away.
- **What a team holds.** A name, a daily check-in time (9:00 to begin with), a
  time zone, and its work days (Monday to Friday to begin with). Each person
  can shift the time and time zone to their own hours on My dashboard
  (see [The morning check-in](morning-check-in.md)).
- **One time-zone picker.** The team's zone, a person's own zone and a new
  team's zone use the same list you can type into: "tor" finds
  America/Toronto. The browser's zone and the team's sit at the top, and a
  saved zone the browser doesn't know is kept (`time-zone-select.tsx`).
- **A wrong value stays in its box, marked red,** until it's fixed: a check-in
  time that isn't a time, an empty tag name. The
  error says why, and a refused save keeps what was typed too.

## Team roles give no powers

Tyler, 16 Oct 2026: "Only me, the site admin." The site admin alone changes a
team's settings, invites and removes people, hands tasks on, turns the join
link on and posts the announcement. Rows saved before then still say `owner`
or `admin`, and read as members (`findMembership` in
`src/server/project/access.ts`). There are no roles to pick, no owner to hand
the team to and no Leave team.

## Invites

- **An invite makes the employee at once.** The site admin types one address,
  or up to 20 on separate lines or with commas, semicolons or spaces between
  them ("Ann <ann@x.com>" as copied from an email works). Each becomes an
  employee account, named from the address ("ben.tester@acme.com" becomes
  "Ben Tester") until they change it, and is on the team straight away, with
  the team's starter tasks and its whole-team projects.
- **The email is the shell's "Set your password".** Its link works once and
  runs out on the shell's usual clock. Opening it sets the password, confirms
  the address and signs them in on My dashboard. There is no link to copy,
  because whoever opens it gets into the account.
- **Until they set a password** they show as "Invited" on the Members page and
  the Team dashboard, with Resend, which sends a fresh link and stops the old
  one. A forgotten password later is reset from "Forgot password" on `/login`.
- **An address already on a team** is refused: "That email is already on a
  team." An account that isn't an employee (a member or an admin) is refused
  too. An employee whose team let them go is put on the new team and told by
  email to sign in with their usual password (`invite-email.ts`).
- **With several addresses** the window lists what happened to each: on the
  team and emailed, on a team already, not an employee, not an email address,
  or not sent because of the cap.
- **Email switched off.** On a server with no email key, the account is still
  made and the window says the link went to the server log. In production a
  mail that can't be sent removes the fresh account again, so the invite can
  simply be sent once more.
- **Caps.** 30 invites an hour from the site admin, and 5 a day to one address.
- **Invites from before 16 Oct 2026**, which waited to be accepted, were
  removed by `drizzle/0119_project_employees_and_site_admin.sql`; those
  addresses are invited again as employees.
- **Starter tasks.** Each person who joins, either way, gets the team's
  starter tasks as their own "Just me" tasks, handed out by the site admin,
  with one notice: "Tyler gave you 3 tasks". They arrive accepted. People
  already on the team get nothing.

## The join link

One link to paste in a message, instead of inviting people one by one.

- **The site admin turns it on** in Team settings. Whoever opens it is signed
  out: they type their name and email on `/join/<secret>`, become an employee
  on the team straight away with no approval (Tyler's choice, 10 Oct 2026),
  and get the "Set your password" email.
- **An email that already has an account is refused**, so a link can't move
  somebody else's account onto a team: "That email already has an account.
  Ask the site admin to add it to the team instead."
- **Shown once.** Only a fingerprint (sha256) of the link's secret is kept, so
  the link is shown when it is made and never again. "Make a new link"
  replaces it, and the old one stops working at once. "Turn it off" stops it
  too. Both ask first, inside the card.
- **It works for 7 days.** An expired or reset link says so in words.
- **Against a leaked link:** at most 20 people a day can join through one
  link, one address can try 10 times an hour, the shell's human check runs
  when it is set up, and the site admin gets "Leo joined the team through the
  link" in the bell each time.

## Job titles

- **A short title beside each name**, up to 40 characters, such as
  "Copywriter": on the Team dashboard's member list, the Members page, each
  project's members, the Workload tab and the hand-to picker in a task.
- **Each person sets their own** on My dashboard's left panel. **The site
  admin can change anyone's** from that person's page, opened from the
  Members page or the Team dashboard.
  Both say Saving…, then Saved or Not saved, beside the field.

## Removing people

- **Removing someone** takes the person off every project in the team, then
  off the team. They lose access to it at once and keep their account, so the
  site admin can put them on a team again.
- **Their tasks stay.** Each task they were assigned to is left with nobody
  assigned and a note of whose it was, such as "Nobody (was Ben)".
- **Their check-ins stay**, so task history still shows the days they worked
  on a task. They no longer appear on the Team dashboard (see
  [History](history.md)).

## Handing over all of someone's tasks

For when someone leaves or goes away, so their work isn't left with nobody.

- **"Hand over all tasks"** is on each row of the Members page, and in the
  remove-member window ("Hand over their tasks first"), for the site admin.
  Pick who receives them.
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
(`assets/pasted-image-1791659665679304000.png`), redrawn by him on 14 Oct
2026 (`assets/pasted-image-1792017230135278000.png`, the announcement's menu
in `...7250513263000.png` and the Attention tab in `...7275530947000.png`). The panels resize and
collapse like the project page's, and below 1280px wide one shows at a time,
under Calendar, Team and Day tabs. Picking a day on the calendar switches to
Day. The tab is "Day" so it doesn't sit over the panel's own Check-ins tab.

- **Left: the team**, as Tyler drew it on 16 Oct 2026
  (`assets/pasted-image-1792200037598390000.png`). The team's cover photo
  fades into the panel, with no heading (Tyler removed "Team" on 16 Oct
  2026) and the cog showing while the top of the panel is pointed at
  (always on a touch screen); the team's square
  avatar overlaps its foot beside the name, the day it was created and its
  city (see The cover and the avatar below). Then two cards that fold, each
  remembered open or shut in this browser. **This week** has Trends in its
  heading and the four figures in a 2 by 2 grid with lines between.
  **Members · 6** has Manage in its heading (the Members page), then
  **Active** and, under a line, **Invited**: people who haven't set a
  password yet, with a dashed photo and Resend for the site admin. A name
  opens that person's page. Invite people fills the card's foot for the site
  admin. The check-in schedule left this panel on 14 Oct 2026; it is set and
  read in Team settings (the cog).
- **Middle: Calendar and Activity tabs.** Tyler put Activity here on 12 Oct
  2026, because the right panel's three tabs already fill it. The header is
  one row: Calendar and Activity, then the month's name between its arrows
  and Today, then a dropdown with a filter mark reading "Month" (Month or
  Week, and the Due dates switch), the megaphone while no announcement is up,
  and New meeting. On a phone the month and its arrows take a second row.
  The team's announcement is a thin bar under the header (below), then a
  month, or a week, of the team's check-ins and meetings, with the weekday
  names in small capitals. The chosen day's meetings are on the right panel.
  The tab and the Month or Week choice are remembered in this browser. See [Meetings](meetings.md),
  [History](history.md#past-days-on-the-team-dashboard) and The team's
  Activity below.
- **Right: the chosen day.** Its header is the tabs, Check-ins, Workload
  and, for the site admin, Attention, drawn like the project page's (Settings
  → Styling → Dashboard tabs);
  Attention carries the count of tasks needing it in red. There is no date
  or arrows: the day is picked on the calendar (Tyler, 16 Oct 2026). Under
  each tab sit the day's **Meetings** (the whole row lights on hover and
  opens the meeting; "+ Add" opens New meeting on that day, Join opens its
  video link, the cog changes it) and, with Due dates on, **Due this day**.
  - **Check-ins**, as Tyler drew it on 16 Oct 2026
    (`assets/pasted-image-1792199207802160000.png`): the card's heading is
    "4 of 6 checked in" with "2 blocked" and "2 late" pills, then a bar with
    one piece per person (red blocked, amber late, dark on time, grey not
    yet). Each person who checked in has their time and Late, then under
    the team's word for "Today" each task they picked as a card of its own,
    "Since yesterday" when it was carried over. A blocked task's card is
    red, with "Blocked", the reason and Reply. Their own words, when they
    wrote any, sit above the cards; with nothing, "No tasks attached". A
    **Didn't check in** card lists the rest with a dashed photo and what they
    picked last time ("Yesterday: Book the photographer") or "No recent
    check-ins", and an **Away** card whoever was on time off (see
    [History](history.md#past-days-on-the-team-dashboard)).
  - **Workload** and **Attention**: see
    [Needs attention and workload](needs-attention.md).
  - **Times read in your own clock.** "Checked in 4:02 AM" for a London
    teammate's 9:02 check-in, read in Toronto, the way meetings already read.
    Only the time moves: late is still judged on the teammate's own clock and
    check-in time, and they stay on their own day.
  - **A day nobody is expected** reads "A day off for the team." with no bar,
    instead of "0 of 0 checked in". A day with nothing saved at all, such as
    one before the team began, reads "Nothing was saved for this day."
  - **A day still to come** shows today, and says so: "Wed, Oct 14 hasn't
    happened yet. Showing today." Workload, for
  everyone, and Needs attention, for the site admin (see
  [Needs attention and workload](needs-attention.md)). The tab last used is
  remembered in this browser.

### The team's Activity

What moved today, without opening every project.

- **The same lines as a project's Activity tab** (see
  [Projects and tasks](projects-and-tasks.md#activity)), across every
  project the viewer can see, newest first, 50 at a time with "Show older".
  Each line names its project beside the time.
- **Only what the viewer can see.** The site admin sees every shared
  project; an employee sees their own projects. A line from a project the
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

- **It is a thin bar under the calendar's header**, as Tyler drew it on 14
  Oct 2026: the megaphone, the words, who posted it and when, "Read by 4 of
  6" for the site admin, then "..." and the X.
- **The site admin posts it.** The megaphone in the calendar's header
  opens a window with one box, up to 500 characters, and Post announcement.
  While one is up, "Post a new one" in its "..." menu opens the same window.
- **Everyone else on the team gets "Maya posted an announcement"** in the
  bell, with the start of it under the heading. It opens the Team dashboard.
- **One at a time.** A new one replaces the old one and rings the bell again.
  Take down, in the "..." menu, removes it for everyone after a window asks
  "Take the announcement down?".
- **Each person can hide it for themselves** with the X. It stays hidden for
  them until the next one is posted, which shows again.
- **It shows who posted it and when** ("2 days ago").
- **It is one message, never a team chat.** Nobody replies to it. Talk about
  a project goes in that project's chat (see
  [Projects and tasks](projects-and-tasks.md#the-projects-chat)).
- **20 an hour at most per person**, since each one rings everyone's bell.
- **"Read by 4 of 6"** sits under it for the site admin only. Pressing it
  lists who has seen it and who hasn't yet, with their photos. Everyone on
  the team now counts, whenever they joined. Seeing it on the Team dashboard
  counts once, and hiding it counts. The site admin is never counted. A new announcement starts
  again at nobody. Members never see the names, so nobody is watched by
  their peers.
- **Where it is saved:** on `project_teams` (`announcement_id`, `_text`,
  `_by_user_id`, `_at`), and who hid which one on `project_team_members`
  (`hidden_announcement_id`), in `drizzle/0109_project_chat_and_talking.sql`.
  Who has seen each one is `project_announcement_views`, one row per person
  per announcement, in `drizzle/0113_project_nine_features.sql`.
  Rules in `src/server/project/announcements.ts`, the card and window in
  `src/components/project/team-announcement.tsx`.

### The cover and the avatar

- **The cover** is the team's photo (`photo_url`), drawn wide across the top
  of the left panel and fading into it. With none there is no cover at all:
  the avatar, name and date move up to the top of the panel (Tyler, 16 Oct
  2026), and the site admin adds one with the picture button beside the cog
  in the panel's corner, shown on hover.
- **The name and date** sit level with the middle of the avatar.
- **The avatar** is a square picture beside the team's name (Tyler, 16 Oct
  2026: "whats missing is the avatar, we need to add that"), saved in
  `avatar_url` (`drizzle/0120_project_team_avatar.sql`). With none it shows
  the team's initials, "ST".
- **The site admin changes either by clicking it**, which opens the shared
  media library to upload or pick a picture (Tyler's choice, 11 Oct 2026),
  cropped wide for the cover and square for the avatar. The red × on its
  corner, shown on hover, takes it away.
- **Everyone else sees them**, and nothing to click.
- **The server only takes a picture the person uploaded themselves**, so
  nobody can point the team at another person's file or at an address outside
  the library. A file the library refuses (too big, or not a picture) says why
  in the upload window.
- **If a picture is later deleted from the library**, the panel shows no
  cover or the initials rather than a broken picture.

### The four figures

A 2 by 2 grid in the This week card (`src/server/project/team-figures.ts`).
The check-in rate is amber, with a bar, below 90 out of 100.
Tyler chose what each counts on 11 Oct 2026.

- **Members**, with how many of them were invited and haven't set a password
  yet, such as "1 pending invite".
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
holidays, starter tasks and the join link, the team's tags (see
[Tags and groups](tags-and-groups.md)), and its saved step lists
(see [Projects and tasks](projects-and-tasks.md#tasks)). Only the site admin
sees the cog: Team settings are theirs alone.

- **Check-in boxes**: rename the three notes, such as "Wins" and "Focus".
  Empty keeps the usual word. See
  [The morning check-in](morning-check-in.md#the-teams-own-words-for-the-boxes).
- **Team holidays**: a date and a name, today or later. See
  [Team holidays](morning-check-in.md#team-holidays).
- **Starter tasks**: up to 10 titles each new member gets as "Just me" tasks.
  The site admin sees whether they're done in each person's Just me list on
  Projects. Each field saves when it is
left or picked, so the window ends with Done, and the top of the window says
Saving…, then Saved or Not saved (see
[Fields that save themselves](fields-that-save-themselves.md)). Closing it with
Escape or a click outside saves the field being typed in too. Tyler first
asked for these in Settings → App settings, then chose the window.

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
- **Time off** that hasn't ended yet. The site admin can add and remove it
  here; everyone else reads the dates.
- **Job title.** The site admin changes it here. "Hand over all their tasks"
  closes the window and opens the hand-over (see
  [Handing over all of someone's tasks](#handing-over-all-of-someones-tasks)).
- **Never a way for teammates to watch someone** (Tyler, 13 Oct 2026). To a
  teammate it shows only what the app already shows elsewhere.
- **The site admin also sees their private things** (Tyler, 16 Oct 2026:
  "Tyler sees private things too"), in a Private card: their check-in record
  ("On time 18 of the last 20 work days"), this week's check-ins as My week
  shows them, and the last 10 notes they left at check-out. The screens that
  say "Only you see this" to an employee say "Only you and the site admin see
  this".
- **Where it lives:** `loadTeammate` and `loadTeamMember` in
  `src/server/project/teammate.ts`, the chat's way in through
  `src/components/project/person-pages.tsx`,
  and the window in `src/components/project/member-dialog.tsx`, which used
  to hold only the role.

### The Members page

`/team/members`, opened from Manage:

- **Everyone on the team** with their job title, Active or Invited, and the
  date they joined. Clicking a row opens that person's page (above).
- **The site admin** invites from Invite, sends an invited person a fresh link
  with Resend (its hover label says the old link stops working), hands all of
  someone's tasks on, and removes people one at a time or several at once.
  Searching clears the ticks, so Remove never acts on someone the search has
  hidden. Employees see the same page to read.

## Where it lives

- **Rules:** `src/server/project/teams.ts` and `src/server/project/invites.ts`,
  with handing over, the join link, job titles, Needs attention and workload
  in `src/server/project/team-running.ts`.
- **Tables:** the join link and job titles in
  `drizzle/0104_project_running_the_team.sql`, the team photo in
  `drizzle/0105_project_team_dashboard.sql`, and the boxes' names, starter
  tasks, holidays and blocker replies in
  `drizzle/0106_project_checkin_and_handing_out.sql`.
- **Starter tasks:** `src/server/project/starter-tasks.ts`, given out when an
  invite or the join link puts someone on the team (`addEmployee` in
  `invites.ts`).
- **`project_site_admin_teams`** (`drizzle/0119_project_employees_and_site_admin.sql`)
  held the dropdown's pick. Its `team_id` is no longer read; the row still
  holds the site admin's calendar setting, `calendar_due_dates`.
- **The four figures:** `src/server/project/team-figures.ts`, drawn by
  `src/components/project/team-figures.tsx` with the team photo.
- **Who may do what:** `src/server/project/access.ts` (`findMembership`,
  `requireSiteAdmin`, `requireProjectSettings`).
- **Screens:** `src/components/project/team-dashboard.tsx`,
  `src/components/project/team-settings-dialog.tsx` with the check-in cards
  in `team-checkin-settings.tsx`,
  `src/components/project/team-members.tsx`,
  `src/components/project/team-start.tsx`,
  `src/components/project/teams-dashboard.tsx` and the join page
  `src/routes/join.$token.tsx`.
- **Tests:** `src/server/project/employees-and-site-admin.test.ts`,
  `src/server/project/teams-dashboard.test.ts` (the list, delete and notice links),
  `src/server/project/project.test.ts`, the figures and photo
  in `src/server/project/team-dashboard.test.ts`, and the announcement in
  `src/server/project/chat-and-talking.test.ts`.
