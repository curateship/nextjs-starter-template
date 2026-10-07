# Focus history

The report page at `/history`, over four ranges — 7 days, 30 days, 12
months, this year. A week review card at the top, the badges panel, four stat
cards (focus time, sessions, active days, tasks done), a calendar heatmap, an
hour-of-day chart, a focus-time trend chart (the shell's chart component,
monthly bars on the long ranges), the top 8 tasks by focus time beside the
same time split by project, a completed-sessions table paged 20 at a time, and
CSV export. The per-project card is described in [Projects](projects.md), the
badges panel in [Achievements](achievements.md), and the sessions table's Note
column in [Session notes](session-notes.md).

## Your week

The card at the top of the page. It shows this week's focus time, how that
compares with last week, the best day of this week, and the project that took
the most of this week.

The week runs **Monday to Sunday**, the same first day the calendar heatmap's
rows already start on, so the two never disagree about which days a week holds.

The comparison is written in hours and minutes and never as a percentage. A
percentage change from a week of nothing means nothing, and two stacked
percentages cannot be checked by hand. It reads "2h 10m more than last week",
"1h 5m less than last week", or "The same as last week" when the two weeks
match to the minute.

A first week says "This is your first week, so there is nothing to compare to
yet" rather than claiming a difference against zero. "There is no last week"
means the account had recorded nothing at all before last Monday. An account
that was quiet last week but active before it has a last week of zero, which is
a real comparison and is shown as one.

This card ignores the range tabs, because it is always this week against last
week, which is why it loads on its own rather than arriving with the report.
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
  heatmap's tooltip, the best day in Your week and the badges panel. The short
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
the visual heatmap and chart for screen readers.

## When a card fails to load

Every card on the page that loads on its own says so inside its own frame,
with a Try again button that runs that card's load again: "Your week could
not be loaded", "Your achievements could not be loaded", and the report's
"Your focus history could not be loaded". Nothing asks you to reload the page,
which would restart a running timer for a card that failed. The red error
toast appears too, and dismissing it never leaves an empty card. A later load
that works takes the warning down.