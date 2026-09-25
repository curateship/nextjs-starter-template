import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  DownloadIcon,
  Loader2Icon,
  LockKeyholeIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { exportFocusHistory, loadFocusHistory } from "@/lib/api/pomodoro/history"
import {
  formatFocusDuration,
  isLongRangeReport,
  reportRangeLabels,
  reportRanges,
  shiftLocalDate,
  type ReportRange,
} from "@/lib/pomodoro/focus-history"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { browserTimezone } from "@/lib/pomodoro/timer"

type FocusHistoryResult = Awaited<ReturnType<typeof loadFocusHistory>>
type ReportDay = FocusHistoryResult["days"][number]

function dayLabel(localDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${localDate}T12:00:00`).toLocaleDateString(undefined, options)
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

function heatLevel(focusSeconds: number, maxSeconds: number) {
  if (focusSeconds <= 0 || maxSeconds <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((focusSeconds / maxSeconds) * 4)))
}

const HEAT_CLASSES = [
  "bg-[rgba(var(--p-fg-rgb),0.08)]",
  "bg-[rgba(255,90,60,0.25)]",
  "bg-[rgba(255,90,60,0.45)]",
  "bg-[rgba(255,90,60,0.7)]",
  "bg-[var(--p-accent)]",
]

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

function HeatmapCard({ days, today }: { days: ReportDay[]; today: string }) {
  const maxSeconds = Math.max(...days.map((day) => day.focusSeconds), 0)
  const leadingBlanks = (new Date(`${days[0].localDate}T12:00:00`).getDay() + 6) % 7
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
        <div className="flex gap-2" aria-hidden="true">
          <div className="grid grid-rows-7 gap-1 font-mono text-[9px] text-muted-foreground">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index} className="h-3 leading-3">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <i key={`blank-${index}`} className="size-3 rounded-[3px]" />
            ))}
            {days.map((day) => (
              <i
                key={day.localDate}
                className={cn(
                  "size-3 rounded-[3px]",
                  HEAT_CLASSES[heatLevel(day.focusSeconds, maxSeconds)],
                  day.localDate === today && "ring-1 ring-[var(--p-accent-2)]"
                )}
                title={`${dayLabel(day.localDate, { month: "short", day: "numeric" })} · ${formatFocusDuration(day.focusSeconds)} · ${day.focusSessions} ${day.focusSessions === 1 ? "session" : "sessions"}`}
              />
            ))}
          </div>
        </div>
        <div
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
          aria-hidden="true"
        >
          <span>Less</span>
          {HEAT_CLASSES.map((heat) => (
            <i key={heat} className={cn("size-3 rounded-[3px]", heat)} />
          ))}
          <span>More</span>
        </div>
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
              <th scope="row">{day.localDate}</th>
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
        label: dayLabel(`${month.key}-15`, { month: "short" }),
        focusMinutes: Math.round(month.focusSeconds / 60),
        focusSessions: month.focusSessions,
      }))
    : days.map((day) => ({
        key: day.localDate,
        label:
          range === "7d"
            ? dayLabel(day.localDate, { weekday: "short" })
            : dayLabel(day.localDate, { day: "numeric" }),
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
                <i
                  aria-hidden="true"
                  className="block h-1.5 overflow-hidden rounded-full bg-[rgba(var(--p-fg-rgb),0.08)]"
                >
                  <b
                    className="block h-full rounded-full bg-[var(--p-accent)]"
                    style={{
                      width: `${Math.max(4, Math.round((task.focusSeconds / maxSeconds) * 100))}%`,
                    }}
                  />
                </i>
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
                <i
                  aria-hidden="true"
                  className="block h-1.5 overflow-hidden rounded-full bg-[rgba(var(--p-fg-rgb),0.08)]"
                >
                  <b
                    className="block h-full rounded-full bg-[var(--p-accent)]"
                    style={{
                      width: `${Math.max(4, Math.round((project.focusSeconds / maxSeconds) * 100))}%`,
                    }}
                  />
                </i>
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
                    {dayLabel(session.localDate, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
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
      ? `${dayLabel(report.startDate, { month: "short", day: "numeric" })} – ${dayLabel(report.endDate, { month: "short", day: "numeric" })} · today updates as you complete sessions`
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
              <Button asChild className="rounded-full font-bold">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
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
          <p role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </p>
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
