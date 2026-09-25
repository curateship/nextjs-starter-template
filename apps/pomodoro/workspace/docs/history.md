# Focus history

The report page at `/history`, over four ranges — 7 days, 30 days, 12
months, this year. Four stat cards (focus time, sessions, active days,
tasks done), a calendar heatmap, a focus-time trend chart (the shell's
chart component, monthly bars on the long ranges), the top 8 tasks by
focus time beside the same time split by project, a completed-sessions table
paged 20 at a time, and CSV export. The per-project card is described in
[Projects](projects.md), and the sessions table's Note column in
[Session notes](session-notes.md).

## The rules it keeps

- **Only completed focus sessions count.** Breaks, running, paused and
  cancelled sessions never appear anywhere on the page.
- **Date maths runs in the profile's timezone in JS, never in SQL.** The
  range resolves to local calendar dates, and each date's starting instant
  comes from `localDateStartInstant` (fixed-point iteration over the zone
  offset — the old app's rule, ported in
  `src/server/pomodoro/focus-report.ts`). The widest range is one leap
  year, so no request scans unbounded history.
- **Sessions with no task, or a deleted task,** group into one neutral "No
  task" bucket instead of leaking or dropping rows.
- **The 12-month and year ranges are one Pro perk** (`longRangeReports` —
  a free 12 months would make gating the year meaningless). The server
  refuses with PRO_REQUIRED; the page shows the lock card with the upgrade
  path and a way back to 30 days.
- **CSV export** (up to 20,000 rows, oldest first) quotes per RFC 4180 and
  prefixes formula-looking cells with an apostrophe so a spreadsheet never
  executes them (`src/lib/pomodoro/report-csv.ts`). File names carry the
  local date range, so repeated exports stay stable.

Endpoints: `src/lib/api/pomodoro/history.ts`, both guarded. Screen:
`src/components/pomodoro/history-page.tsx`, with hidden data tables behind
the visual heatmap and chart for screen readers.
