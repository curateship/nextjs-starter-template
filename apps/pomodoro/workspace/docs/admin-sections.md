# Admin sections

Twenty-three operator pages inside the shell's `/admin`. They let an operator see
what members are doing, decide reports, and delete what should not be there.
Every delete and every report decision is written to `pomodoro_audit_logs`.

## The pages

| Address | What it shows |
| --- | --- |
| `/admin/pomodoro-focus` | Every account with its focus totals |
| `/admin/pomodoro-tasks` | Everybody's tasks |
| `/admin/pomodoro-sessions` | Every timer run |
| `/admin/pomodoro-rooms` | Every focus room, open and closed |
| `/admin/pomodoro-themes` | Every theme, Draft or Live, and who has it |
| `/admin/pomodoro-sounds` | Every sound, Draft or Live, and who has it |
| `/admin/pomodoro-reports` | The moderation queue |
| `/admin/pomodoro-room-repeats` | Every weekly room rule |
| `/admin/pomodoro-task-repeats` | Every repeating task rule |
| `/admin/pomodoro-invites` | Every room invitation, and cancelling unsent ones |
| `/admin/pomodoro-room-presets` | The house presets hosts pick from |
| `/admin/pomodoro-chat` | Every room's chat, a search across it, held lines |
| `/admin/pomodoro-bans` | Room bans, hidden profiles and suspensions, with Lift |
| `/admin/pomodoro-settings` | The Pomoder settings page |
| `/admin/pomodoro-profiles` | Every public profile with a handle, and a window to fix the handle, name or bio, or hide it |
| `/admin/pomodoro-uploads` | Every background and sound a member uploaded or had AI make, with Delete |
| `/admin/pomodoro-tags` | Every member task tag and how many tasks carry it, with Delete |
| `/admin/pomodoro-leaderboard` | The global board as members see it with hours a focus day, and Take off the board |
| `/admin/pomodoro-follows` | Follows and cheers, two tabs, with Delete |
| `/admin/pomodoro-blocks` | Who blocked whom, and the most blocked accounts. Read-only |
| `/admin/pomodoro-achievements` | Who earned which badge, with Revoke |
| `/admin/pomodoro-groups` | Every private focus group, its members, and Delete |
| `/admin/pomodoro-generations` | Every AI background and soundscape request, with Delete for the file |

A member's name on any of these lists opens the member window over the page,
with `?member=<userId>` in the address. What it shows and the two repair tools
in it, fixing a streak day and the private notes, are in
[Members in the admin](admin-members.md).

Each page is its own route file under
`src/routes/_authenticated/admin/pomodoro-*.tsx`, the way trade and video add
their admin pages. Nothing registers them in a menu: the admin sidebar is a
saved setting, so an operator adds the links they want in Settings, and the
pages work from a typed address before anyone does.

On the local Pomodoro workspace the menu holds them like this. Weekly rooms
sits under Rooms, beside Sessions and Reports, and Repeating tasks sits under
Tasks. Profiles, between Focus and Pages, opens Public profiles and has
Leaderboard and Achievements under it, as Tyler asked on 8 Oct 2026. The live site's menu is its own saved setting and has to be given the
same two links after a deploy.

## Finding one member's focus data

Focus data is the page an operator starts on. Each row is one account, with how
many focus sessions it has finished, how long that adds up to, how many tasks it
completed and the last day it focused. The timer button at the end of a row
opens Focus sessions already filtered to that person, and the toolbar then says
"Only <their name>" with a way to clear it.

The totals on Focus data come from `daily_focus_stats`, which is the same daily
rollup the member's own history screen reads, so the two always agree. Focus
sessions lists the raw `focus_sessions` rows instead. The two counts can differ
for an account whose history was imported from guest mode, because the import
carries the daily totals across without inventing a session row for each one.

Accounts that have never run a timer are still listed, on zero. An operator
searching for somebody should find them, not find an empty table and wonder
whether the search is broken.

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

Every list page has the shape every other admin table in the monorepo has: a
selection checkbox first, sortable data columns, and an actions column last.

- **The header checkbox** ticks every row on the page and shows the half-ticked
  state when only some are ticked. It is dead on an empty table, because there
  is nothing to tick.
- **Ticked rows grow a "Delete (N)" button** at the front of the toolbar, on
  every list that can delete. Room reports also has Resolve, Dismiss and Reopen
  there.
- **The actions column ends with the bin.** Before it sits the way to the list
  that answers the next question:

  - Focus data and Tasks lead to that member's focus sessions.
  - Focus sessions leads to that member's tasks.
  - Focus rooms leads to the report queue searched on that room's name, then
    Close, the cog for the room window, and the bin. See
    [Rooms in the admin](rooms-admin.md).
  - Room reports has its three decision buttons.

The date column on Tasks, Focus rooms and Room reports shows only on a screen
1536px wide or more. With the bin added, the row actions ran past the right-hand
edge of a 1280px screen by 47px, 50px and 216px, measured. With the dates
hidden, every list fits at 1280. Below that the table scrolls sideways inside
its box, as it did before.

Every list has a selection column and an actions column. Themes and Sounds
add Free, Pro, Draft and Live to the ticked-row buttons.

One file owns the table. `admin-list.tsx` draws the selection column, the header
checkbox, the empty row's width and the toolbar's "Clear N selected" chip, so a
new page gets the lot by passing one `selection` prop. `admin-delete.tsx` owns
the bin, the toolbar button and the confirm window, so all seven lists that
delete ask and answer the same way.

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

## The record of every delete

Every delete writes one row to `pomodoro_audit_logs`, in the same table and the
same way report decisions and a host's moderation already do. There is no page
that lists it. Tyler had the Action log page built on 8 Oct 2026 and took it
out the same day, so the record is read from the database when it is needed.

## Themes and Sounds

Two pages, one for each kind, replaced the single read-only Media table on
8 Oct 2026. An admin adds, edits, orders, prices, hides and deletes every
theme and sound there, and members see the change on their next page load.
`/admin/pomodoro-media` now forwards to Themes. The rules, the window and the
worker are in [Themes and sounds in the admin](catalog-admin.md).

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
- `src/components/pomodoro/admin-delete.tsx`: the bin, "Delete (N)" and the
  confirm window, shared by the seven lists that delete.
- `src/components/pomodoro/admin-list.tsx` — the shared list plumbing: hold the
  rows the loader fetched, refetch a quarter of a second after the address
  changes, and draw the shell's dashboard table.
- `src/components/pomodoro/admin-*-dashboard.tsx` — one file per page.

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

A page past the end puts itself right. Resolving the last report on page 2 of a
filtered list, or another operator removing rows, used to leave the table saying
"No reports match those filters." while the footer underneath said "1-3 of 3".
The list now drops back to the last real page instead.
