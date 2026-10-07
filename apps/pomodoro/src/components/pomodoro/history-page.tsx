import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  DownloadIcon,
  Loader2Icon,
  LockKeyholeIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { AchievementsCard } from "@/components/pomodoro/achievements-card"
import {
  FocusHeatmap,
  FocusHeatmapKey,
} from "@/components/pomodoro/focus-heatmap"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Meter } from "@/components/ui/meter"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { formatLongDay, formatShortDay } from "@/lib/format/calendar-day"
import {
  exportFocusHistory,
  loadFocusHistory,
  loadFocusWeekReview,
} from "@/lib/api/pomodoro/history"
import {
  formatFocusDuration,
  formatFocusSpan,
  isLongRangeReport,
  reportRangeLabels,
  reportRanges,
  shiftLocalDate,
  weekComparisonLabel,
  type ReportRange,
} from "@/lib/pomodoro/focus-history"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast } from "@/lib/toast/error-toast"

type FocusHistoryResult = Awaited<ReturnType<typeof loadFocusHistory>>
type ReportDay = FocusHistoryResult["days"][number]
type WeekReview = Awaited<ReturnType<typeof loadFocusWeekReview>>

// A chart's tick under one bar: "Tue", "6" or "Oct". Not a date on its own,
// so it is not one of the two forms in `calendar-day.ts`.
function axisTick(localDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${localDate}T12:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  })
}

// Fills calendar gaps so charts and the heatmap show honest zero days
// instead of skipping them. Ranges are bounded server-side.
function fillDays(
  startDate: string,
  endDate: string,
  days: readonly ReportDay[]
) {
  const byDate = new Map(days.map((day) => [day.localDate, day]))
  const filled: ReportDay[] = []
  for (let date = startDate; date <= endDate; date = shiftLocalDate(date, 1)) {
    filled.push(
      byDate.get(date) ?? {
        localDate: date,
        focusSeconds: 0,
        focusSessions: 0,
        tasksCompleted: 0,
      }
    )
  }
  return filled
}

function aggregateMonths(days: readonly ReportDay[]) {
  const months = new Map<
    string,
    { key: string; focusSeconds: number; focusSessions: number }
  >()
  for (const day of days) {
    const key = day.localDate.slice(0, 7)
    const month = months.get(key) ?? { key, focusSeconds: 0, focusSessions: 0 }
    month.focusSeconds += day.focusSeconds
    month.focusSessions += day.focusSessions
    months.set(key, month)
  }
  return [...months.values()]
}


function HeatmapCard({ days, today }: { days: ReportDay[]; today: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Focus calendar</CardTitle>
        <span className="text-xs text-muted-foreground">
          {formatFocusDuration(
            days.reduce((total, day) => total + day.focusSeconds, 0)
          )}{" "}
          total
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* The same grid a public profile draws, from
            `focus-heatmap.tsx`, so the two can never disagree square for
            square on the same day. */}
        <FocusHeatmap days={days} today={today} />
        <FocusHeatmapKey />
        <DayTable caption="Daily focus totals" days={days} />
      </CardContent>
    </Card>
  )
}

// Screen-reader equivalent for the visual charts; the visuals stay hidden.
function DayTable({
  caption,
  days,
}: {
  caption: string
  days: readonly {
    localDate: string
    focusSeconds: number
    focusSessions: number
  }[]
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Focus time</th>
          <th scope="col">Sessions</th>
        </tr>
      </thead>
      <tbody>
        {days
          .filter((day) => day.focusSessions > 0)
          .map((day) => (
            <tr key={day.localDate}>
              <th scope="row">
                {/* A month row's key is "2026-10", which is not a day. */}
                {day.localDate.length === 10
                  ? formatLongDay(day.localDate)
                  : day.localDate}
              </th>
              <td>{formatFocusDuration(day.focusSeconds)}</td>
              <td>{day.focusSessions}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

const trendConfig = {
  focusMinutes: { label: "Focus minutes", color: "var(--p-accent)" },
} satisfies ChartConfig

function TrendCard({
  range,
  days,
}: {
  range: ReportRange
  days: ReportDay[]
}) {
  const monthly = isLongRangeReport(range)
  const bars = monthly
    ? aggregateMonths(days).map((month) => ({
        key: month.key,
        label: axisTick(`${month.key}-15`, { month: "short" }),
        focusMinutes: Math.round(month.focusSeconds / 60),
        focusSessions: month.focusSessions,
      }))
    : days.map((day) => ({
        key: day.localDate,
        label:
          range === "7d"
            ? axisTick(day.localDate, { weekday: "short" })
            : axisTick(day.localDate, { day: "numeric" }),
        focusMinutes: Math.round(day.focusSeconds / 60),
        focusSessions: day.focusSessions,
      }))
  const peakSeconds = Math.max(0, ...days.map((day) => day.focusSeconds))
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Focus time {monthly ? "by month" : "by day"}</CardTitle>
        <span className="text-xs text-muted-foreground">
          peak {formatFocusDuration(peakSeconds)}
        </span>
      </CardHeader>
      <CardContent>
        <div className="h-48" aria-hidden="true">
          <ChartContainer config={trendConfig} className="h-full w-full">
            <BarChart data={bars}>
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dy={6}
                interval={bars.length > 20 ? 4 : 0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, dx: -5 }}
                width={36}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="focusMinutes"
                fill="var(--color-focusMinutes)"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ChartContainer>
        </div>
        <DayTable
          caption={monthly ? "Monthly focus totals" : "Daily focus totals"}
          days={bars.map((bar) => ({
            localDate: bar.key,
            focusSeconds: bar.focusMinutes * 60,
            focusSessions: bar.focusSessions,
          }))}
        />
      </CardContent>
    </Card>
  )
}

/**
 * How long a Top tasks or By project bar is drawn: its share of the longest,
 * but never under 4% of it, so a row with a few minutes still shows a sliver
 * beside its name. The bar's spoken value states the real time.
 */
function barValue(seconds: number, maxSeconds: number) {
  return Math.max(seconds, maxSeconds * 0.04)
}

/** "9am", "12pm", "11pm" — the plainest name for an hour of the day. */
function hourLabel(hour: number) {
  if (hour === 0) return "12am"
  if (hour === 12) return "12pm"
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

const hourConfig = {
  sessions: { label: "Sessions finished", color: "var(--p-accent)" },
} satisfies ChartConfig

/**
 * Which hours of the day the person actually finishes focus sessions in, in
 * their own timezone. The bars count finished sessions rather than minutes,
 * because the question is when work gets done, not how long each one ran.
 *
 * The axis is always all 24 hours so its shape never moves between ranges. A
 * range with nothing in it says so instead of drawing 24 empty bars.
 */
function HourOfDayCard({ hours }: { hours: FocusHistoryResult["hours"] }) {
  const total = hours.reduce((sum, hour) => sum + hour.sessions, 0)
  const busiest = hours.reduce(
    (best, hour) => (hour.sessions > best.sessions ? hour : best),
    hours[0]
  )
  const bars = hours.map((hour) => ({
    ...hour,
    label: hourLabel(hour.hour),
  }))
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>When you focus</CardTitle>
        <span className="text-xs text-muted-foreground">
          {total
            ? `busiest hour ${hourLabel(busiest.hour)} · ${total} ${total === 1 ? "session" : "sessions"}`
            : "by hour of day"}
        </span>
      </CardHeader>
      <CardContent>
        {total ? (
          <>
            <div className="h-40" aria-hidden="true">
              <ChartContainer config={hourConfig} className="h-full w-full">
                <BarChart data={bars}>
                  <CartesianGrid strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    dy={6}
                    interval={2}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, dx: -5 }}
                    width={36}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="sessions"
                    fill="var(--color-sessions)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ChartContainer>
            </div>
            {/* Screen-reader equivalent of the bars above. */}
            <table className="sr-only">
              <caption>Focus sessions finished by hour of day</caption>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Focus time</th>
                </tr>
              </thead>
              <tbody>
                {bars
                  .filter((hour) => hour.sessions > 0)
                  .map((hour) => (
                    <tr key={hour.hour}>
                      <th scope="row">{hour.label}</th>
                      <td>{hour.sessions}</td>
                      <td>{formatFocusDuration(hour.focusSeconds)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Finish a focus session and the hour it ended in shows up here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * This week against last week, at the top of the page.
 *
 * It ignores the range tabs, because it is always this week against last week,
 * which is why it loads on its own rather than arriving with the report. The
 * week runs Monday to Sunday, the same first day the calendar's rows start on.
 */
function WeekReviewCard() {
  const [review, setReview] = React.useState<WeekReview | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  // Bumped by Try again, which runs the same load once more.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadFocusWeekReview(browserTimezone())
      .then((result) => {
        if (!live) return
        setError("")
        setReview(result)
      })
      .catch(() => {
        if (live) setError("Your week could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [attempt])

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Your week</CardTitle>
        {review ? (
          <span className="text-xs text-muted-foreground">
            {formatShortDay(review.weekStart)} –{" "}
            {formatShortDay(review.endDate)}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <span
            role="status"
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
            Loading…
          </span>
        ) : null}
        {error ? (
          <ErrorRow
            message={error}
            onRetry={() => {
              dismissErrorToast()
              setError("")
              setLoading(true)
              setAttempt((count) => count + 1)
            }}
          />
        ) : null}
        {review ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <strong className="text-2xl">
                {formatFocusSpan(review.thisWeekSeconds)}
              </strong>
              <span className="text-sm text-muted-foreground">
                {weekComparisonLabel(
                  review.thisWeekSeconds,
                  review.lastWeekSeconds,
                  review.hasLastWeek
                )}
              </span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <WeekFact
                label="Best day"
                value={
                  review.bestDay
                    ? formatLongDay(review.bestDay.localDate)
                    : "No focus yet this week"
                }
                hint={
                  review.bestDay
                    ? formatFocusDuration(review.bestDay.focusSeconds)
                    : null
                }
              />
              <WeekFact
                label="Most time on"
                value={
                  review.topProject
                    ? (review.topProject.name ?? "No project")
                    : "No focus yet this week"
                }
                hint={
                  review.topProject
                    ? formatFocusDuration(review.topProject.focusSeconds)
                    : null
                }
              />
            </dl>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function WeekFact({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string | null
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">
        {value}
        {hint ? (
          <span className="text-muted-foreground"> · {hint}</span>
        ) : null}
      </dd>
    </div>
  )
}

function TopTasksCard({
  topTasks,
}: {
  topTasks: FocusHistoryResult["topTasks"]
}) {
  const maxSeconds = Math.max(1, ...topTasks.map((task) => task.focusSeconds))
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Top tasks</CardTitle>
        <span className="text-xs text-muted-foreground">by focus time</span>
      </CardHeader>
      <CardContent>
        {topTasks.length ? (
          <ul className="flex flex-col gap-3">
            {topTasks.map((task) => (
              <li key={task.taskId ?? "no-task"} className="flex flex-col gap-1">
                <span
                  className={cn(
                    "text-sm",
                    !task.title && "text-muted-foreground"
                  )}
                >
                  {task.title ?? "No task"}
                </span>
                <Meter
                  label={`Focus time on ${task.title ?? "no task"}`}
                  value={barValue(task.focusSeconds, maxSeconds)}
                  max={maxSeconds}
                  valueText={`${formatFocusDuration(task.focusSeconds)} of ${formatFocusDuration(maxSeconds)}, the most on any task`}
                />
                <small className="font-mono text-[10px] text-muted-foreground">
                  {formatFocusDuration(task.focusSeconds)} · {task.sessions}{" "}
                  {task.sessions === 1 ? "session" : "sessions"}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Focus sessions you complete will rank their tasks here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The same focus time one level up: by project rather than by task. Sessions
 * on a task in no project, and sessions on no task at all, share the "No
 * project" row instead of being dropped, so the bars always add up to the
 * range's total. An archived project still appears — leaving the picker never
 * erases the hours it earned.
 */
function TopProjectsCard({
  topProjects,
}: {
  topProjects: FocusHistoryResult["topProjects"]
}) {
  const maxSeconds = Math.max(
    1,
    ...topProjects.map((project) => project.focusSeconds)
  )
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>By project</CardTitle>
        <span className="text-xs text-muted-foreground">by focus time</span>
      </CardHeader>
      <CardContent>
        {topProjects.length ? (
          <ul className="flex flex-col gap-3">
            {topProjects.map((project) => (
              <li
                key={project.projectId ?? "no-project"}
                className="flex flex-col gap-1"
              >
                <span
                  className={cn("text-sm", !project.name && "text-muted-foreground")}
                >
                  {project.name ?? "No project"}
                </span>
                <Meter
                  label={`Focus time on ${project.name ?? "no project"}`}
                  value={barValue(project.focusSeconds, maxSeconds)}
                  max={maxSeconds}
                  valueText={`${formatFocusDuration(project.focusSeconds)} of ${formatFocusDuration(maxSeconds)}, the most on any project`}
                />
                <small className="font-mono text-[10px] text-muted-foreground">
                  {formatFocusDuration(project.focusSeconds)} ·{" "}
                  {project.sessions}{" "}
                  {project.sessions === 1 ? "session" : "sessions"}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Put a task in a project on the Tasks page and its hours land here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsCard({
  sessions,
  page,
  onPage,
}: {
  sessions: FocusHistoryResult["sessions"]
  page: number
  onPage: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(sessions.totalRows / sessions.pageSize))
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Completed sessions</CardTitle>
        <span className="text-xs text-muted-foreground">
          {sessions.totalRows} in range
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sessions.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead>Focused</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.rows.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    {formatLongDay(session.localDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {session.localTime}
                  </TableCell>
                  <TableCell
                    className={session.taskTitle ? "" : "text-muted-foreground"}
                  >
                    {session.taskTitle ?? "No task"}
                  </TableCell>
                  <TableCell>
                    {formatFocusDuration(session.plannedSeconds)}
                  </TableCell>
                  <TableCell>
                    {formatFocusDuration(session.accumulatedSeconds)}
                  </TableCell>
                  {/* An unnoted session shows an em dash rather than words,
                      so a column of notes reads as notes and the gaps stay
                      quiet. The line is capped at 120 characters when it is
                      written, and clamped here so one long note cannot set
                      the width of every row. The clamp is tighter on a phone
                      because this table already scrolls sideways there, and
                      the full line is still on the row's tooltip. */}
                  <TableCell
                    className={
                      session.note
                        ? "max-w-[11rem] truncate sm:max-w-[22rem]"
                        : "text-muted-foreground"
                    }
                    title={session.note ?? undefined}
                  >
                    {session.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No completed focus sessions in this range yet.
          </p>
        )}
        {pageCount > 1 ? (
          <footer className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {Math.min(page + 1, pageCount)} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </footer>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** The report page over 7 days, 30 days, 12 months or this year. */
export function HistoryPage() {
  const { authenticated } = useProductAuth()
  const [range, setRange] = React.useState<ReportRange>("7d")
  const [page, setPage] = React.useState(0)
  const [report, setReport] = React.useState<FocusHistoryResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [exporting, setExporting] = React.useState(false)
  // null until the first response tells us; then gates long ranges up front.
  const [longRangeUnlocked, setLongRangeUnlocked] = React.useState<
    boolean | null
  >(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestRef = React.useRef(0)
  const rangeLocked = isLongRangeReport(range) && longRangeUnlocked === false

  React.useEffect(() => {
    if (!authenticated || rangeLocked) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError("")
    loadFocusHistory({ range, page, timezone: browserTimezone() })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setReport(result)
        setLongRangeUnlocked(result.longRangeUnlocked)
      })
      .catch((cause) => {
        if (requestRef.current !== requestId) return
        if (cause instanceof Error && cause.message.includes("PRO_REQUIRED"))
          setLongRangeUnlocked(false)
        else setError("Your focus history could not be loaded.")
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false)
      })
    // `authenticated` belongs here. It starts false on a direct load of this
    // address, because the layout sets it a tick later; without it in the list
    // the effect never runs again and the page sits on "Loading…" for good.
  }, [authenticated, range, page, rangeLocked, reloadKey])

  const changeRange = (next: ReportRange) => {
    if (next === range) return
    setRange(next)
    setPage(0)
    setNotice("")
  }

  const exportCsv = async () => {
    setExporting(true)
    setNotice("")
    try {
      const result = await exportFocusHistory({
        range,
        timezone: browserTimezone(),
      })
      const url = URL.createObjectURL(
        new Blob([result.csv], { type: "text/csv;charset=utf-8" })
      )
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = result.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setNotice("The CSV export could not be generated. Try again.")
    } finally {
      setExporting(false)
    }
  }

  const days =
    report && !rangeLocked
      ? fillDays(report.startDate, report.endDate, report.days)
      : []
  const today = report?.endDate ?? ""
  const rangeSummary =
    report && !rangeLocked
      ? `${formatShortDay(report.startDate)} – ${formatShortDay(report.endDate)} · today updates as you complete sessions`
      : "Only completed focus sessions count — breaks and cancelled timers never do."
  const empty =
    Boolean(report) &&
    !rangeLocked &&
    report!.totals.focusSessions === 0 &&
    report!.sessions.totalRows === 0

  if (!authenticated) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight">Focus history</h2>
          <p className="text-sm text-muted-foreground">
            Your private record of completed focus sessions.
          </p>
        </header>
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <h3 className="text-lg font-bold">Sign in to see your history</h3>
            <p className="text-sm text-muted-foreground">
              Focus history is built from sessions synced to your account, so
              there is nothing to show for guests. Your reports are private —
              only you can see them.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/register">Create free account</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight">Focus history</h2>
          <p className="text-sm text-muted-foreground">{rangeSummary}</p>
        </header>

        {/* This week, then the milestones, then the numbers for the chosen
            range. Both of these read their own fixed period and ignore the
            range tabs, which is why they sit outside the block the range
            redraws. */}
        <WeekReviewCard />
        <AchievementsCard />

        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={range}
            onValueChange={(value) => changeRange(value as ReportRange)}
          >
            <TabsList aria-label="Report range">
              {reportRanges.map((option) => (
                <TabsTrigger key={option} value={option}>
                  {reportRangeLabels[option]}
                  {isLongRangeReport(option) && longRangeUnlocked === false ? (
                    <LockKeyholeIcon aria-hidden="true" />
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {loading ? (
            <span
              role="status"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
              Loading…
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={exporting || rangeLocked || empty}
            onClick={() => void exportCsv()}
          >
            {exporting ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <DownloadIcon aria-hidden="true" />
            )}
            Export CSV
          </Button>
        </div>

        {error ? (
          <Card>
            <ErrorRow
              message={error}
              onRetry={() => {
                dismissErrorToast()
                setReloadKey((key) => key + 1)
              }}
            />
          </Card>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        {rangeLocked ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-8">
              <LockKeyholeIcon
                className="size-6 text-[var(--p-accent-2)]"
                aria-hidden="true"
              />
              <h3 className="text-lg font-bold">
                Long-range reports are part of Pro
              </h3>
              <p className="text-sm text-muted-foreground">
                Free accounts keep the 7- and 30-day reports. Upgrade to unlock
                the 12-month and yearly focus reports.
              </p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/pricing">See Pro plans</Link>
                </Button>
                <Button variant="outline" onClick={() => changeRange("30d")}>
                  Back to 30 days
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : report ? (
          <>
            <section
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              aria-label="Range totals"
            >
              {(
                [
                  [
                    "Focus time",
                    formatFocusDuration(report.totals.focusSeconds),
                    reportRangeLabels[report.range],
                  ],
                  [
                    "Focus sessions",
                    String(report.totals.focusSessions),
                    "completed only",
                  ],
                  [
                    "Active days",
                    String(report.totals.activeDays),
                    `of ${days.length} days`,
                  ],
                  [
                    "Tasks completed",
                    String(report.totals.tasksCompleted),
                    reportRangeLabels[report.range],
                  ],
                ] as const
              ).map(([label, value, hint]) => (
                <Card key={label}>
                  <CardContent className="flex flex-col gap-0.5 py-4">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {label}
                    </span>
                    <strong className="text-xl">{value}</strong>
                    <small className="text-xs text-muted-foreground">
                      {hint}
                    </small>
                  </CardContent>
                </Card>
              ))}
            </section>

            {empty ? (
              <Card>
                <CardContent className="flex flex-col items-start gap-3 py-8">
                  <h3 className="text-lg font-bold">
                    No focus history in this range yet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Complete a focus session and it will appear here within the
                    day it finished. Breaks and cancelled timers are never
                    counted.
                  </p>
                  <Button asChild>
                    <Link to="/timer">Start a focus session</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <HeatmapCard days={days} today={today} />
                <HourOfDayCard hours={report.hours} />
                <TrendCard range={report.range} days={days} />
                {/* Side by side on desktop: the same focus time by task and
                    by project, so one glance compares them. */}
                <section className="grid gap-3 lg:grid-cols-2">
                  <TopTasksCard topTasks={report.topTasks} />
                  <TopProjectsCard topProjects={report.topProjects} />
                </section>
                <SessionsCard sessions={report.sessions} page={page} onPage={setPage} />
              </>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}
