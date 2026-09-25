# Admin sections

Six operator pages inside the shell's `/admin`. Five of them let an operator
look at what members are doing. The sixth, Room reports, is the only one with
buttons that change anything.

## The pages

| Address | What it shows |
| --- | --- |
| `/admin/pomodoro-focus` | Every account with its focus totals |
| `/admin/pomodoro-tasks` | Everybody's tasks |
| `/admin/pomodoro-sessions` | Every timer run |
| `/admin/pomodoro-rooms` | Every focus room, open and closed |
| `/admin/pomodoro-media` | The scenes and loops, and who picked each one |
| `/admin/pomodoro-reports` | The moderation queue |

Each page is its own route file under
`src/routes/_authenticated/admin/pomodoro-*.tsx`, the way trade and video add
their admin pages. Nothing registers them in a menu: the admin sidebar is a
saved setting, so an operator adds the links they want in Settings, and the
pages work from a typed address before anyone does.

## Finding one member's focus data

Focus data is the page an operator starts on. Each row is one account, with how
many focus runs it has finished, how long that adds up to, how many tasks it
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

Three buttons and three standings:

- **Resolve** means the report was fair and has been dealt with. The operator's
  name and the time go in the Status column.
- **Dismiss** means there was nothing wrong. Same record of who decided.
- **Reopen** puts it back to Waiting and **clears the reviewer**, because the
  last decision no longer stands and leaving a name on an open report would say
  somebody had signed off on it.

A message the host already deleted is still shown here in full. The body stays
in `room_messages` for exactly this reason, and the room itself only ever saw
"Message removed by the host". A report whose message row is gone, because the
room was deleted, says "The reported message is no longer on record." rather
than showing a blank line.

Each decision writes one row to `pomodoro_audit_logs` in the same transaction as
the change, with the action `review_report_resolved`, `review_report_pending` or
`review_report_dismissed` and the resource `reports`. Either both rows commit or
neither does, so the log can never disagree with the report's standing. Room
moderation by a host writes to the same table.

## Media

There is no media table to manage. The catalogue is eight background scenes and
eight sound loops fixed in code
(`src/lib/pomodoro/background-catalog.ts` and `sound-catalog.ts`), and the files
ship with the app. What the database knows, and this page shows, is how many
accounts have each one selected right now, plus whether it needs Pro. Files a
member uploaded belong to the shell's own media library at `/admin/media`; they
are counted here as one "Their own upload" row per kind rather than listed
again.

## What these pages will not do

Every page except Room reports is read-only, and that is deliberate. A member's
plan for their day, their timer history and their rooms are theirs; an operator
is here to see them, not to rewrite them. The tables therefore have no selection
checkboxes and no delete, which is the one place they step away from the repo's
table standard. The old app let an operator create and edit rows in every
section, and none of that came across.

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
- `src/server/pomodoro/admin.ts` — the queries and `reviewRoomReport`. A report
  can name three different people, so the accounts table is joined three times
  under three names: `report_reporter`, `report_message_author` and
  `report_reviewer`.
- `src/lib/api/pomodoro/admin.ts` — the server functions, every one behind
  `adminGet` or `adminPost`, so a member calling them by hand is refused
  whatever the sidebar shows them.
- `src/components/pomodoro/admin-list.tsx` — the shared list plumbing: hold the
  rows the loader fetched, refetch a quarter of a second after the address
  changes, and draw the shell's dashboard table.
- `src/components/pomodoro/admin-*-dashboard.tsx` — one file per page.

Search, filters, sort and page all live in the address, so pressing Back returns
the exact list you left and a link can be handed to somebody else. Every value
is checked against a fixed list or a range before use, so a hand-edited address
can only ever fall back to the default. Paging is done by the server with a
ceiling of 100 rows a page.

A page past the end puts itself right. Resolving the last report on page 2 of a
filtered list, or another operator removing rows, used to leave the table saying
"No reports match those filters." while the footer underneath said "1-3 of 3".
The list now drops back to the last real page instead.
