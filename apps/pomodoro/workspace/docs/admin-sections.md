# Admin sections

Every Pomodoro admin list is a tab of one dashboard, Flowfly, at
`/admin/flowfly` since 13 Nov 2026; [The Flowfly admin dashboard](admin-dashboard.md)
covers the frame, the sections and what opens on the right. This file covers
what the lists do: focus data, the report queue, deleting, projects and the
catalogue. Every delete and every report decision is written to
`pomodoro_audit_logs`.

## The lists

| Section → tab | What it shows |
| --- | --- |
| Rooms → Rooms | Every focus room, open and closed; a room's chat, reports, invitations, bans and weekly rule open with it |
| Rooms → Weekly rooms | Every weekly room rule |
| Rooms → Invites | Every room invitation, and cancelling unsent ones |
| Rooms → Presets | The house presets hosts pick from |
| Members → Profiles | Every public profile with a handle and its all-time Focus time; its handle, name and bio are in the member's ⋮ |
| Members → Badges | Who earned which badge, with Revoke |
| Members → Made-up | The made-up members' watch page; see [Made-up members](made-up-members.md) |
| Safety → Reports | The moderation queue |
| Safety → Bans | Room bans, hidden profiles and suspensions, with Lift |
| Safety → Blocks | Who blocked whom, and the most blocked accounts. Read-only |
| Social → Groups | Every private focus group, its members, and Delete |
| Social → Follows, Cheers | Follows and cheers, with Delete |
| Tasks → Tasks | Everybody's tasks |
| Tasks → Sessions | Every timer run |
| Tasks → Repeating | Every repeating task rule |
| Tasks → Projects | Every member's projects with their tasks, hours and target |
| Tasks → Tags | Every member task tag and how many tasks carry it, with Delete |
| Library → Backgrounds, Sounds | Every background and sound, Draft or Live, and who has it |
| Library → Member uploads | Every background and sound a member uploaded or had AI make, with Delete |
| Library → AI generations | Every AI background and soundscape request, with Delete for the file |

A member's name on any of these lists opens the member on the right, with
`?member=<userId>` in the address. What it shows and the two repair tools in
it, fixing a streak day and the private notes, are in
[Members in the admin](admin-members.md).

Each list was a page of its own under `/admin/pomodoro-*` until 13 Nov 2026.
The old addresses forward to their tab. The admin left menu, a saved setting,
holds one Flowfly link in place of the old ones (migration 0183); the live
site's menu changes the same way at the next deploy.

## Finding one member's focus data

Members → Profiles is where to start. Its Focus time column is each person's
all-time focus in hours ("269h", never "11d 5h", which reads as calendar
days), and it sorts. It replaced the Focus and Leaderboard lists (Tyler, 13
Nov 2026: "we dont need the focus and leaderboard tab. instead on profile
table, add a focus time col instead"). A row opens the member on the right:
their Focus card has sessions, hours, tasks and the last day they focused,
and its Show all opens Tasks → Sessions narrowed to them, which then shows the
"Only <their name>" chip described below. The member's ⋮ holds what those two
lists did: Take off the leaderboard (or Put back), and Delete focus data,
which asks for DELETE to be typed first.

### One member at a time

Every admin list that can be limited to one member shows it the same way
(Polish 3 task 10, 10 Oct 2026): a grey chip in the header, before Filter,
saying "Only Sam", with a × that takes `?user=` out of the address and shows
everyone again. A list hands `AdminListTable` its `person`, and the chip is
drawn there (`src/components/pomodoro/admin-list.tsx`).

- **The lists that take one member:** Tasks, Focus sessions, Repeating tasks,
  Projects, Groups, Blocks, Follows, Tags, Member uploads, Generations, Badges,
  and Room reports, which uses `?person=` because it means reports by or about
  that person.
- **The name comes from the rows on screen.** A page with no rows for that
  person, such as an empty one, says "Only one member" rather than nothing.
- **Tasks used to say nothing at all.** Arriving from a member's Focus
  sessions row, the list was already limited to them with no sign of it. It
  now shows the chip like the rest.

Focus time comes from `daily_focus_stats`, which is the same daily rollup the
member's own history screen reads, so the two always agree. Tasks → Sessions
lists the raw `focus_sessions` rows instead. The two counts can differ
for an account whose history was imported from guest mode, because the import
carries the daily totals across without inventing a session row for each one.

Profiles lists people with a handle; somebody without one is found from the
shell's Users list. A profile that has never run a timer shows "0m".

## Report triage

A member reports somebody's message inside a focus room, and the report lands
here as **Waiting**. The row carries the reason, the reported message as it was
written, who wrote it, who reported it, and the room.

Three buttons and three standings, on a row or over a ticked selection:

- **Resolve** means the report was fair and has been dealt with. The operator's
  name and the time go in the Status column.
- **Dismiss** means there was nothing wrong. Same record of who decided.
- **Reopen** puts it back to Waiting and **clears the reviewer**, because the
  last decision no longer stands and leaving a name on an open report would say
  somebody had signed off on it.

### Deciding several at once

Tick the rows and the toolbar grows a **Resolve**, **Dismiss** and **Reopen**
button, each carrying the count. One press is one request over every ticked row
on the page, and the line afterwards says what happened: "4 reports resolved."
or "2 reports reopened, 1 could not be reopened."

A report already at the standing being asked for is left alone rather than
written again, so a bulk Resolve over a mixed selection never restamps somebody
else's decision with a new reviewer and a new date. Those rows are the ones
counted as "could not be". Only the rows on the page on screen are touched: a
tick on page 1 is remembered if you page back, but a press can never reach a row
the operator is no longer looking at.

A row's own buttons stay exactly where they are while the server answers. The
pressed button's icon becomes the spinner and both buttons grey out, so the cell
keeps its width and the rows below it do not shift. Swapping the pair for a bare
spinner collapsed the cell to the width of the spinner and moved every row under
it.

A message the host already deleted is still shown here in full. The body stays
in `room_messages` for exactly this reason, and the room itself only ever saw
"Message removed by the host". A report whose message row is gone, because the
room was deleted, says "The reported message is no longer on record." rather
than showing a blank line.

Each press writes one row to `pomodoro_audit_logs` in the same transaction as
the change, with the action `review_report_resolved`, `review_report_pending` or
`review_report_dismissed`, the resource `reports`, and every report id that
actually moved in `record_ids`. Either both rows commit or neither does, so the
log can never disagree with the report's standing. A press that changed nothing
writes no log row at all. Room moderation by a host writes to the same table.

### Notices about the queue

Every active admin hears a new report in the bell, folded into "4 new
reports." while unread, and those notices turn read on their own once no
report is open. Closing a report tells its reporter "Thanks, your report was
reviewed." in the same words whether it was resolved or dismissed, and hiding
a profile tells its owner. The full rules are under Notices in
[Reporting and blocking](reporting-and-blocking.md).

## The shape of every table

Every list is drawn by `AdminListTable` in `src/components/pomodoro/admin-list.tsx`
in the shell's CRM header and table shape; the full description is under
"Middle" in [The Flowfly admin dashboard](admin-dashboard.md).

- **Tick boxes show only while Select is on.** The heading's box ticks every
  row on the page and shows the half-ticked state when only some are ticked.
- **Ticked rows gather in one "N selected" menu** in the header: Delete on
  every list that can delete, and each list's own changes (Resolve, Dismiss
  and Reopen on Reports, Free, Pro, Draft and Live on Backgrounds and Sounds).
- **A row's own buttons end with the bin.** Before it sits the way to the list
  that answers the next question:

  - Focus and Tasks lead to that member's sessions.
  - Sessions leads to that member's tasks.
  - Rooms leads to Reports searched on that room's name. See
    [Rooms in the admin](rooms-admin.md).
  - Reports has its decision buttons.

- **Columns drop out as the middle narrows**, and below a 448px middle only
  the name and its buttons stay, so no table runs past its panel at any
  width. Measured on every tab from 1280 to 2240px in 40px steps, and at
  390px.

`admin-delete.tsx` owns the bin's confirm window, so every list that deletes
asks and answers the same way.

## Deleting

Tyler, 8 Oct 2026: the admin can delete rooms, sessions, reports, focus data and
tasks, one at a time or many at once. Before that, every page except Room
reports was read-only on purpose. That rule is gone.

### How a delete works

- **A row's bin and the toolbar make the same one request**, with one id or
  every ticked id on the page. A tick on another page is never touched, the
  same rule the report buttons follow.
- **A confirm window says what goes with the rows and what stays**, then
  "Delete room" or "Delete rooms". It ends "This cannot be undone." because
  nothing here can be.
- **A lost answer still rereads the list.** If the server's reply never
  arrives, the error toast shows and the list is read again, so it never keeps
  showing rows that may already be gone.
- **The line afterwards counts what went**: "3 rooms deleted." or
  "1 session deleted. 1 was still running, or already gone." A press that
  removed nothing is shown as a failure, with the same words.
- **Only the deleted rows lose their tick.** Deleting one row on its own leaves
  the rest of a selection ticked.

### The rule for every toolbar and row button

Tyler's Polish 3 task 09, 10 Oct 2026: a button tells the truth while it works.

- **Red only when nothing changed.** Every multi-row action works out one
  line from `describeBulkResult`. It shows in the red error toast when no row
  changed, and nothing pops up when at least one did. That
  holds for Delete, Close, Feature and Unfeature on Rooms and Weekly
  rooms, Resolve, Dismiss, Reopen, Hide and Unhide on Reports, Let through
  on a room's Chat card, Approve on Member uploads, and Free, Pro, Draft and Live on
  Backgrounds and Sounds. On those four the line also counts rows already in
  that state, so a run that only finds them says nothing.
- **Only the pressed button spins.** Hide and Unhide have their own spinner,
  so pressing Hide no longer spins Resolve. Feature, Unfeature and each Let
  through spin on their own too.
- **One action at a time per list.** Each list works out one `busy` from every
  action it can run. While any of them runs, every toolbar button and every
  row button that changes something waits: Delete, Close, the decisions, Hide,
  Feature, Let through, Approve, the sharing menu and the bins. The cog that
  opens a row's record stays pressable.
- **Hide and Unhide are toolbar buttons like the rest**, 32px and labelled
  "Hide (N)" and "Unhide (N)", counting the ticked profile reports.
- **One transaction per press**, with one `pomodoro_audit_logs` row naming every
  id that actually went. A press that removed nothing writes no log row.

### What each delete takes with it

| Page | What goes | What stays | What is put right |
| --- | --- | --- | --- |
| Focus rooms | The room, its chat, reactions, members, bans, invites and message reports | Focus sessions run in it, without the room's name | Unread "it's open" and invite notices, and every mention or reaction notice about its messages, are removed. The admins' "new reports" notices turn read if the queue is now empty. People still inside see "You are no longer in this room." If that nudge fails, the delete still counts as done and is logged on the server, and their screen catches up when it reconnects. |
| Focus sessions | The runs | A run still going is skipped | A finished focus comes back off that day's total and its task's count |
| Tasks | The tasks, their steps and tags | Focus time spent on them, without the task's name | A ticked task comes off "tasks done" for its day. A carried task pointing at a deleted copy has the pointer cleared |
| Room reports | The reports | The message or profile they were about | The admins' "new reports" notices turn read if the queue is now empty. Nobody is told, unlike Resolve and Dismiss |
| Focus data | The account's finished and cancelled runs, every daily total, every task's session count | The account, its tasks, projects, rooms, profile and earned badges, and a run still going | Nothing else to put right: every figure the member shows off reads zero |
| Weekly rooms | The rule | Rooms it already booked, which still open | |
| Repeating tasks | The rule | Tasks it already made | |
| Projects | The project | Its tasks and repeating-task rules, with no project, and every hour in History under "No project" | The owner is told "The Flowfly team deleted your project Thesis. Its tasks are kept." A public project's held profile page is dropped so it stops showing at once |

### Taking a session back off the totals

A finished focus added one session and its seconds to that day's
`daily_focus_stats` row, and one to its task's count. Deleting it takes both
back off, so History, the streak, the leaderboard, the badge counters, the
public profile and the share card all drop to match.

- **The day is worked out, not stored.** A session row does not say which day
  it counted towards. The timer added it under "today" in the profile's
  timezone at the moment it finished, so the delete runs the same sum on the
  stored finish time. A member who has since changed timezone can have a
  session sitting on the next or previous day, which the delete then misses.
- **Subtract, never recount.** A day imported from guest mode has totals with
  no session rows under it, and a recount from the rows would wipe it.
- **Never below zero.** A day that somehow holds less than the session took off
  reads zero.
- **Breaks and cancelled runs change nothing**, because they never counted.
- **Badges already earned stay.** Taking them back is a separate power.

### Running timers are left alone

Deleting a run that is still going, or clearing the focus data of somebody
mid-session, would pull the timer out from under their open tab. Those runs are
skipped, and the line says so. When the run finishes it counts as normal,
starting a fresh daily total if the old ones were cleared.

### Clearing focus data asks for a word

Focus data is the one delete that wipes everything a member shows off, so the
window has a box: type DELETE, then press Delete focus data. Pressing it with
the box wrong keeps the window open, marks the box and says "Type DELETE to
confirm." The button is never greyed out while the box is empty.

## Projects

Tasks → Projects lists every member's projects. Before 8 Oct 2026
projects were the only member records with no admin page. Tyler asked for it
that day: "there is no admin projects dashboard".

### The list

- **The columns** are the project's name with its coloured square, the owner,
  tasks, hours focused all time, the target, and the date it was made (on a
  screen 1536px wide or more, beside Profile, which says whether it shows on
  the owner's public page). An archived project says Archived beside its name
  instead of in a column of its own, so the list fits a 1280px screen.
- **The target cell has two lines**: "10h a week", and under it the words
  under the owner's own bar, "4h of 10h this week". The week and month are the
  owner's, in the owner's timezone. A project with no target leaves it blank.
- **The tasks and hours are the owner's own figures.** Both are the same SQL
  the Projects card on `/tasks` reads (`projectTaskCount` and
  `projectFocusSeconds` in `src/server/pomodoro/projects.ts`), so a row and the
  card can never disagree. A carried task is counted once.
- **Search** finds a project name, an owner's name or an owner's email. The
  filters are live or archived, on the public profile or private, and has a
  target or not. Every sort column but Tasks and Focused works out the hours
  for the page on screen only. Sorting by Tasks or Focused has to count every
  project the filters let through.
- **The owner's name opens the member on the right.** `?user=<id>` narrows the
  list to one member, with the "Only <name>" chip to clear it.

### A project on the right

A project opens in the right panel (`?open=<id>`), where its window used to.

- **Figures**: owner, tasks, hours all time, target, this period so far, public
  or not, and when it was made.
- **Newest tasks**: the last 10, carried copies left out, with a link to the
  owner's tasks.
- **The ⋮**: Name and Target, the same fields as the owner's own settings,
  each a row that opens a small box and saves when it is left, then Delete
  project in red. A name is up to 60 characters and unique among the owner's
  live projects, ignoring case. The database's own index refuses a clash, and
  the error says "The owner already has a live project with that name." Hours
  are whole numbers from 1 to 744, or blank for no target.
- **The footer**: Live or when it was archived, and Archive or Bring back,
  which act at once. Bringing a project back is refused when the owner has
  since made a live project with the same name, the same as for the owner.

### What the owner is told

Every change is one transaction with one `pomodoro_audit_logs` row (resource
`projects`, action `edit`, `archive`, `unarchive` or `delete`) and one notice
to the owner. None names the admin. An admin changing their own project is not
told, because nobody is notified about their own action, and the record, the
toasts and the delete window then leave out "is told in the bell".

- A rename: "The Flowfly team renamed your project Thesis to PhD."
- A new target: "The Flowfly team changed the target on your project Thesis."
- Both in one save: "The Flowfly team changed your project Thesis: it is now
  PhD, with a new target."
- "The Flowfly team archived your project Thesis." and "… brought back your
  project Thesis."
- "The Flowfly team deleted your project Thesis. Its tasks are kept."

A save that changes nothing writes nothing and tells nobody. A change to a
public project drops the owner's held public page, so the new name shows at
once.

### Deleting

On a row, over ticked rows, and in the record's ⋮. The confirm window says "2
projects will be deleted. Their 14 tasks are kept with no project, and the
focus time stays in each person's History." A single project names itself
and its owner. The tasks and repeating-task rules stay, with an empty project,
through the `on delete set null` both columns already had. The owner's
Projects card loses the project and their tasks show with no project name.

## The record of every delete

Every delete writes one row to `pomodoro_audit_logs`, in the same table and the
same way report decisions and a host's moderation already do. There is no page
that lists it. Tyler had the Action log page built on 8 Oct 2026 and took it
out the same day, so the record is read from the database when it is needed.

## Backgrounds and Sounds

Two pages, one for each kind, replaced the single read-only Media table on
8 Oct 2026. An admin adds, edits, orders, prices, hides and deletes every
background and sound there, and members see the change on their next page load.
The old `/admin/pomodoro-media` forwards to Library → Backgrounds. The rules, the window and the
worker are in [Backgrounds and sounds in the admin](catalog-admin.md).

## What these pages will not do

An operator can delete a member's rooms, tasks and timer history but never edit
them. A task's wording and a room's settings stay the member's own. The one
exception is a public profile's handle, display name and bio, which an admin
can fix from Public profiles, and the owner is told what changed.

Users, plans, billing and AI usage are not here either. The shell already owns
those screens at `/admin/users`, `/admin/plans` and `/admin/ai`, and a second
copy would give an operator two places to look.

## Where the code lives

- `src/lib/pomodoro/admin-lists.ts` — every sort column and every filter, in one
  place. Three things need the same answer and must not disagree: the route
  checks the address against these lists, the server function validates against
  them, and the table draws its headings from them. The lists sit here rather
  than beside the queries so a route can import one without dragging the
  database driver into the browser bundle.
- `src/server/pomodoro/admin.ts`: the queries and `reviewRoomReports`, which
  takes one id or many so a row button and the toolbar cannot drift apart.
- `src/server/pomodoro/admin-deletes.ts`: every delete, each taking one id or
  many, with what it puts right and its log row. Tested against a real
  database in `admin-deletes.test.ts`. A report
  can name three different people, so the accounts table is joined three times
  under three names: `report_reporter`, `report_message_author` and
  `report_reviewer`.
- `src/lib/api/pomodoro/admin.ts` — the server functions, every one behind
  `adminGet` or `adminPost`, so a member calling them by hand is refused
  whatever the sidebar shows them.
- `src/components/pomodoro/admin-delete.tsx`: the delete hook and the confirm
  window, shared by every list that deletes.
- `src/components/pomodoro/admin-list.tsx`: the shared list plumbing. It holds
  the rows the loader fetched, asks again a quarter of a second after the
  address changes, and draws the list as a Flowfly tab: the shell's CRM
  header and table, the row (`AdminRow`), and the record or member on the
  right.
- `src/server/pomodoro/admin-projects.ts`: the Projects list, window, save,
  archive and delete. Tested against a real database in
  `admin-projects.test.ts`.
- `src/components/pomodoro/admin-*-dashboard.tsx`: one file per list, each a
  tab of Flowfly. The frame, address and records are in
  `src/components/pomodoro/flowfly/` and `src/lib/pomodoro/flowfly-*.ts`.

Search, filters, sort and page all live in the address, so pressing Back returns
the exact list you left and a link can be handed to somebody else. Every value
is checked against a fixed list or a range before use, so a hand-edited address
can only ever fall back to the default. Paging is done by the server with a
ceiling of 100 rows a page.

Opening a list never asks the server twice. The page arrives with its rows,
and the list only fetches again when the address changes. Until 8 Oct 2026 it
fetched a second time a quarter of a second after opening, because React runs
the fetch check twice on mount and only the first run was skipped. On an empty
list that took the "No … match" line away for a moment, and the footer jumped
up and back. The empty line now also stays, dimmed, while a search or a delete
reloads the list.

An empty list says "No presets yet." when nothing narrows it, and "No presets
match those filters." only while a search or a filter is in the address
(`AdminListTable` reads which from the address; a list may pass its own
`emptyText`).

A page past the end puts itself right. Resolving the last report on page 2 of a
filtered list, or another operator removing rows, used to leave the table saying
"No reports match those filters." while the footer underneath said "1-3 of 3".
The list now drops back to the last real page instead.
