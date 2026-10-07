# Focus history

The report page at `/history`, over four ranges: 7 days, 30 days, 12 months
and this year. Drawn to Tyler's design of 7 Oct 2026
(`assets/pasted-image-1791402090336300000.png`), top to bottom:

- **The header:** the title and the dates, with the range tabs and Export CSV
  on the right.
- **The strip:** four figures in one panel. Focus time, Sessions (with
  today's time and sessions under it), Active days, and Streak (with the best
  under it).
- **By day** (by month on the long ranges), with a Time or Sessions switch,
  beside **This week**.
- **When you focus** beside **Top tasks**, which holds By project under a line.
- **Completed sessions**, the table, with the tag filter on the right.
- **Achievements · N of 10**, with Show on profile, which opens Settings →
  Public page where badges are published.

The per-project rows are described in [Projects](projects.md), the badges in
[Achievements](achievements.md), and the table's Note column in
[Session notes](session-notes.md). Every panel uses the shared
`panel-card.tsx`.

## The strip

- **Focus time, Sessions and Active days follow the range tabs.** The line
  under Focus time names the range.
- **Sessions also says today**, as "1h 40m today · 4 sessions", whatever
  range is picked. The figures under it moved here on 7 Oct 2026 from the
  "Your stats" cards, which the redesign folded away.
- **Streak never follows the range.** It is the current run of days in a
  row, with the best under it, and arrives with the week review.
- **The design puts "↑ 1h 15m vs last week" under Focus time. The page does
  not.** That comparison is Monday to today against last week, while Focus
  time is the range, such as the last 7 days. Under a 7-day total of 2h 05m
  it would have read as if 2h 05m were the week. The comparison lives in This
  week instead, next to the figure it is about.
- **Tasks completed** is no longer a figure of its own. It is the note on Top
  tasks.

## By day

Bars of focus per day, or per month on 12 months and This year. The switch
in the corner shows Time (minutes, the default) or Sessions. The switch is
not kept in the address.

## The range is in the address

The chosen range lives in the page address, `/history?range=12m`, so a reload
or Back keeps it and a link can open a particular range. 7 days is the plain
`/history`, and anything else in the address falls back to it
(`validateSearch` in `src/routes/_pomodoro/history.tsx`). Picking a range
replaces the address rather than adding to it, so Back leaves History instead
of stepping through every range you clicked. A long range on a free account
shows the same locked card whether it was clicked or typed into the address.
It used to be held only on the page, so opening something and pressing Back
put you on 7 days again.

## This week

The panel beside By day. It shows this week's focus time, how that compares
with last week (green with an up arrow when it is more), the best day, the
project that took the most time, and the busiest hour: the hour most of this
week's sessions finished in, with a tie going to the earlier hour.

The week runs **Monday to Sunday**, the same first day the profile's year
grid starts its rows on.

The comparison is written in hours and minutes and never as a percentage. A
percentage change from a week of nothing means nothing, and two stacked
percentages cannot be checked by hand. It reads "↑ 2h 10m more than last week",
"1h 5m less than last week", or "The same as last week" when the two weeks
match to the minute.

A first week says "Your first week, so nothing to compare yet" rather than claiming a difference against zero. "There is no last week"
means the account had recorded nothing at all before last Monday. An account
that was quiet last week but active before it has a last week of zero, which is
a real comparison and is shown as one.

This panel ignores the range tabs, because it is always this week against last
week, which is why it loads on its own rather than arriving with the report.
The same request brings the streak for the strip and the busiest hour
(`loadWeekReview` in `src/server/pomodoro/focus-report.ts`).
It is free on every plan.

## When you focus

A bar for each of the 24 hours, counting the focus sessions that **finished**
in that hour, in the profile's timezone. It answers when work actually gets
done rather than how long each session ran, which is why the bars count
sessions and not minutes.

The axis is always all 24 hours, so its shape never moves between ranges. A
range with nothing in it says so instead of drawing 24 empty bars. The card's
right-hand line names the busiest hour and the number of sessions, and that
number is the same one the stat cards above print.

It follows the range tabs like the rest of the report, so the 12-month and year
views stay a Pro perk.

## The rules it keeps

- **Only completed focus sessions count.** Breaks, running, paused and
  cancelled sessions never appear anywhere on the page.
- **Date maths runs in the profile's timezone in JS.** The range resolves to
  local calendar dates, and each date's starting instant comes from
  `localDateStartInstant` (fixed-point iteration over the zone offset — the
  old app's rule, ported in `src/server/pomodoro/focus-report.ts`). The widest
  range is one leap year, so no request scans unbounded history.
- **The hour-of-day bucket is the one calculation that runs in SQL.**
  `extract(hour from completed_at at time zone <profile zone>)` groups in the
  database because the alternative is fetching every session row in the range
  only to count it. Postgres and `Intl` read the same IANA zone names, and the
  zone is a bound parameter that `validTimezone` has already accepted.
- **Sessions with no task, or a deleted task,** group into one neutral "No
  task" bucket instead of leaking or dropping rows.
- **The 12-month and year ranges are one Pro perk** (`longRangeReports` —
  a free 12 months would make gating the year meaningless). The server
  refuses with PRO_REQUIRED; the page shows the lock card with the upgrade
  path and a way back to 30 days.
- **One way of writing a day.** `src/lib/format/calendar-day.ts` holds two
  forms. The long one, "Tue, Oct 6, 2026", is used by the sessions table, the
  profile's year grid tooltip, the best day in This week and the badges panel. The short
  one, "Oct 6", is used for the two ends of a range, where the year is plain.
  The ticks under the chart's bars ("Tue", "6", "Oct") are not dates on their
  own and stay as they are.
- **Every day is the account's day.** The server works out each session's
  `YYYY-MM-DD` in the profile's timezone, and the page prints that string as
  it is, so a browser in another timezone cannot move a session to the day
  before.
- **CSV export** (up to 20,000 rows, oldest first) quotes per RFC 4180 and
  prefixes formula-looking cells with an apostrophe so a spreadsheet never
  executes them (`src/lib/pomodoro/report-csv.ts`). File names carry the
  local date range, so repeated exports stay stable.
- **The CSV writes the same day as `2026-10-06`, not "Tue, Oct 6, 2026".**
  It is the same day in the same timezone, written the one way every
  spreadsheet reads as a date in every country. "Tue, Oct 6, 2026" lands in
  a spreadsheet as text, which cannot be sorted or summed by date.

Endpoints: `src/lib/api/pomodoro/history.ts`, all three guarded (the report,
the CSV export and the week review). Screen:
`src/components/pomodoro/history-page.tsx`, with hidden data tables behind
the By day and When you focus charts for screen readers.

## The bars in Top tasks and By project

Each row's bar is the shared `Meter`, so a screen reader hears its name and
its value, for example "Focus time on Thesis, 42m of 3h 10m, the most on any
project". The bar is drawn against the longest row, and never shorter than
4% of it, so a row with a few minutes still shows a sliver. The spoken value
is always the real time.

## A project's target in By project

A project with an hours target ([Projects](projects.md)) gets a second, muted
bar under its row and a line such as "Target: 4h of 10h this week". The target
always reads its own week or month, whichever range tab is picked, which is
why the line names the period. A targeted project with no focus in the chosen
range has no row in By project, so it shows no target line here either; the
Projects card on `/tasks` always shows it.

## Filtering the sessions table by tag

The Completed sessions card has a tag picker in its header, listing every tag
the account has ever made ([Tasks](tasks.md#tags)). Picking "admin" narrows
the table to sessions whose task carries "admin" now, and the header reads
"2 tagged admin · 1h 15m" in place of "N in range".

- **Only the table, its count and its total follow the filter.** The stats,
  the charts and the two splits above it stay whole, because they
  are read from the per-day totals, which know nothing of tags.
- **The CSV export follows it.** The file holds what the table shows.
- **A tag reaches a session through its task**, the same way a project does,
  so tagging a task later puts its earlier sessions under the tag too.
- **Another account's tag id matches nothing.** The filter checks the tag
  belongs to the person asking (`taggedWith` in
  `src/server/pomodoro/focus-report.ts`).

## When a card fails to load

Every card on the page that loads on its own says so inside its own frame,
with a Try again button that runs that card's load again: "Your week could
not be loaded", "Your achievements could not be loaded", and the report's
"Your focus history could not be loaded". Nothing asks you to reload the page,
which would restart a running timer for a card that failed. The red error
toast appears too, and dismissing it never leaves an empty card. A later load
that works takes the warning down.