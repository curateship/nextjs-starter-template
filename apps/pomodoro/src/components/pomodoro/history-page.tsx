import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  Loader2Icon,
  LockKeyholeIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"

import { AchievementsCard } from "@/components/pomodoro/achievements-card"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  weekComparison,
  type ReportRange,
} from "@/lib/pomodoro/focus-history"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { targetProgressLabel } from "@/lib/pomodoro/project-targets"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { TextLink } from "@/components/pomodoro/text-link"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"

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

const byDayConfig = {
  minutes: { label: "Focus minutes", color: "var(--p-accent)" },
  sessions: { label: "Sessions", color: "var(--p-accent)" },
} satisfies ChartConfig

/**
 * Focus by day (by month on the long ranges), as time or as sessions. Time is
 * the default because it is what the strip above leads with; Sessions is one
 * click away and lives only on the page, not in the address.
 */
function ByDayPanel({
  range,
  days,
}: {
  range: ReportRange
  days: ReportDay[]
}) {
  const [metric, setMetric] = React.useState<"minutes" | "sessions">("minutes")
  const monthly = isLongRangeReport(range)
  const bars = monthly
    ? aggregateMonths(days).map((month) => ({
        key: month.key,
        label: axisTick(`${month.key}-15`, { month: "short" }),
        minutes: Math.round(month.focusSeconds / 60),
        sessions: month.focusSessions,
      }))
    : days.map((day) => ({
        key: day.localDate,
        label:
          range === "7d"
            ? axisTick(day.localDate, { weekday: "short" })
            : axisTick(day.localDate, { day: "numeric" }),
        minutes: Math.round(day.focusSeconds / 60),
        sessions: day.focusSessions,
      }))
  return (
    <PanelCard
      label={monthly ? "By month" : "By day"}
      aside={
        <Tabs
          value={metric}
          onValueChange={(value) => setMetric(value as "minutes" | "sessions")}
        >
          <TabsList
            aria-label="Show focus as"
            className="rounded-full [&>[data-slot=tabs-pill]]:rounded-full"
          >
            <TabsTrigger value="minutes" className="rounded-full px-3">
              Time
            </TabsTrigger>
            <TabsTrigger value="sessions" className="rounded-full px-3">
              Sessions
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="h-56" aria-hidden="true">
        <ChartContainer config={byDayConfig} className="h-full w-full">
          <BarChart data={bars}>
            <CartesianGrid strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11 }}
              dy={6}
              interval={bars.length > 20 ? 4 : 0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, dx: -5 }}
              width={40}
              allowDecimals={false}
              tickFormatter={(value: number) =>
                metric === "minutes" ? `${value}m` : String(value)
              }
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey={metric}
              fill={`var(--color-${metric})`}
              radius={[6, 6, 0, 0]}
              maxBarSize={56}
            />
          </BarChart>
        </ChartContainer>
      </div>
      <DayTable
        caption={monthly ? "Monthly focus totals" : "Daily focus totals"}
        days={bars.map((bar) => ({
          localDate: bar.key,
          focusSeconds: bar.minutes * 60,
          focusSessions: bar.sessions,
        }))}
      />
    </PanelCard>
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
function HourOfDayPanel({ hours }: { hours: FocusHistoryResult["hours"] }) {
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
    <PanelCard
      label="When you focus"
      note={total ? `busiest hour ${hourLabel(busiest.hour)}` : "by hour of day"}
    >
      {total ? (
        <>
          <div className="h-44" aria-hidden="true">
            <ChartContainer config={hourConfig} className="h-full w-full">
              <BarChart data={bars}>
                <CartesianGrid strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dy={6}
                  interval={5}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, dx: -5 }}
                  width={28}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {/* The busiest hour in full orange, the rest a step down,
                    so the answer in the corner is also the brightest bar. */}
                <Bar dataKey="sessions" radius={[4, 4, 0, 0]} maxBarSize={18}>
                  {bars.map((hour) => (
                    <Cell
                      key={hour.hour}
                      fill="var(--color-sessions)"
                      fillOpacity={hour.hour === busiest.hour ? 1 : 0.6}
                    />
                  ))}
                </Bar>
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
    </PanelCard>
  )
}

/**
 * The week review: this week, Monday to today, against last week, with the
 * best day, the project that took the most time, and the busiest hour. It
 * ignores the range tabs, so it loads on its own rather than arriving with the
 * report, and the page hands the same answer to the strip above (the streak).
 */
function useWeekReview(enabled: boolean) {
  const [review, setReview] = React.useState<WeekReview | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  // Bumped by Try again, which runs the same load once more.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    // A guest has no week, and asking would only answer 401.
    if (!enabled) return
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
  }, [attempt, enabled])

  const retry = () => {
    dismissErrorToast()
    setError("")
    setLoading(true)
    setAttempt((count) => count + 1)
  }
  return { review, error, loading, retry }
}

/** Up and green for more than last week, down and quiet for less. */
function WeekChange({
  review,
  long,
}: {
  review: WeekReview
  /** "more than last week" rather than "vs last week". */
  long?: boolean
}) {
  const { change, span } = weekComparison(
    review.thisWeekSeconds,
    review.lastWeekSeconds,
    review.hasLastWeek
  )
  if (change === "first")
    return (
      <span className="text-sm text-muted-foreground">
        Your first week, so nothing to compare yet
      </span>
    )
  if (change === "same")
    return (
      <span className="text-sm text-muted-foreground">
        The same as last week
      </span>
    )
  const up = change === "more"
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-sm",
        up ? "text-[var(--p-success)]" : "text-muted-foreground"
      )}
    >
      <Arrow className="size-3.5" aria-hidden="true" />
      {span} {long ? (up ? "more than" : "less than") : "vs"} last week
    </span>
  )
}

function ThisWeekPanel({
  review,
  error,
  loading,
  onRetry,
}: {
  review: WeekReview | null
  error: string
  loading: boolean
  onRetry: () => void
}) {
  return (
    <PanelCard
      label="This week"
      note={
        review
          ? `${formatShortDay(review.weekStart)} – ${formatShortDay(review.endDate)}`
          : undefined
      }
    >
      {loading ? (
        <span
          role="status"
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
          Loading…
        </span>
      ) : null}
      {error ? <ErrorRow message={error} onRetry={onRetry} /> : null}
      {review ? (
        <>
          <div className="flex flex-col gap-1">
            <strong className="text-4xl font-bold tracking-tight">
              {formatFocusSpan(review.thisWeekSeconds)}
            </strong>
            <WeekChange review={review} long />
          </div>
          <dl className="flex flex-col divide-y border-t">
            <WeekFact
              label="Best day"
              value={
                review.bestDay
                  ? `${formatLongDay(review.bestDay.localDate)} · ${formatFocusDuration(review.bestDay.focusSeconds)}`
                  : "No focus yet"
              }
            />
            <WeekFact
              label="Most time on"
              value={
                review.topProject
                  ? `${review.topProject.name ?? "No project"} · ${formatFocusDuration(review.topProject.focusSeconds)}`
                  : "No focus yet"
              }
            />
            <WeekFact
              label="Busiest hour"
              value={
                review.busiestHour === null
                  ? "No focus yet"
                  : hourLabel(review.busiestHour)
              }
            />
          </dl>
        </>
      ) : null}
    </PanelCard>
  )
}

/** One figure in the strip under the title, with its line under it. */
function StripFigure({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-[var(--p-surface)] p-5 sm:p-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-3xl font-bold tracking-tight">{value}</dd>
      <dd className="text-sm text-muted-foreground">{hint}</dd>
    </div>
  )
}

function WeekFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

/**
 * The range's focus split twice in one panel: by task, then by project.
 * Sessions on a task in no project, and sessions on no task at all, share the
 * "No project" row instead of being dropped, so the bars always add up to the
 * range's total. An archived project still appears — leaving the picker never
 * erases the hours it earned.
 */
function WorkSplitPanel({
  topTasks,
  topProjects,
  projectTargets,
  tasksCompleted,
}: {
  topTasks: FocusHistoryResult["topTasks"]
  topProjects: FocusHistoryResult["topProjects"]
  projectTargets: FocusHistoryResult["projectTargets"]
  tasksCompleted: number
}) {
  const maxTask = Math.max(1, ...topTasks.map((task) => task.focusSeconds))
  const maxProject = Math.max(
    1,
    ...topProjects.map((project) => project.focusSeconds)
  )
  return (
    <PanelCard
      label="Top tasks"
      note={`${tasksCompleted} ${tasksCompleted === 1 ? "task" : "tasks"} completed`}
    >
      {topTasks.length ? (
        <ul className="flex flex-col gap-4">
          {topTasks.map((task) => (
            <SplitRow
              key={task.taskId ?? "no-task"}
              name={task.title}
              fallback="No task"
              seconds={task.focusSeconds}
              sessions={task.sessions}
              maxSeconds={maxTask}
              most="the most on any task"
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Focus sessions you complete will rank their tasks here.
        </p>
      )}
      <h4 className="mt-2 border-t pt-5 font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
        By project
      </h4>
      {topProjects.length ? (
        <ul className="flex flex-col gap-4">
          {topProjects.map((project) => (
            <SplitRow
              key={project.projectId ?? "no-project"}
              name={project.name}
              fallback="No project"
              seconds={project.focusSeconds}
              sessions={project.sessions}
              maxSeconds={maxProject}
              most="the most on any project"
            >
              <ProjectTargetLine
                name={project.name}
                progress={projectTargets.find(
                  (target) => target.projectId === project.projectId
                )}
              />
            </SplitRow>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Put a task in a project on the{" "}
          <TextLink to="/tasks">Tasks page</TextLink> and its hours land here.
        </p>
      )}
    </PanelCard>
  )
}

/** One name with its time and sessions on the right, and its bar under. */
function SplitRow({
  name,
  fallback,
  seconds,
  sessions,
  maxSeconds,
  most,
  children,
}: {
  name: string | null
  fallback: string
  seconds: number
  sessions: number
  maxSeconds: number
  most: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("truncate", !name && "text-muted-foreground")}>
          {name ?? fallback}
        </span>
        <small className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatFocusDuration(seconds)} · {sessions}{" "}
          {sessions === 1 ? "session" : "sessions"}
        </small>
      </div>
      <Meter
        label={`Focus time on ${name ?? fallback.toLowerCase()}`}
        value={barValue(seconds, maxSeconds)}
        max={maxSeconds}
        valueText={`${formatFocusDuration(seconds)} of ${formatFocusDuration(maxSeconds)}, ${most}`}
      />
      {children}
    </li>
  )
}

/**
 * The project's own target, under its share of the range. The target reads
 * its own week or month whatever range is picked, so the line names the
 * period, and the bar is the muted one so it never reads as the range's.
 */
function ProjectTargetLine({
  name,
  progress,
}: {
  name: string | null
  progress: FocusHistoryResult["projectTargets"][number] | undefined
}) {
  if (!progress || !name) return null
  const label = targetProgressLabel(
    progress.focusSeconds,
    progress.targetHours,
    progress.targetPeriod
  )
  return (
    <>
      <Meter
        size="sm"
        tone="muted"
        label={`${name} against its target`}
        value={progress.focusSeconds}
        max={progress.targetHours * 3_600}
        valueText={label}
      />
      <small className="font-mono text-[10px] text-muted-foreground">
        Target: {label}
      </small>
    </>
  )
}

const ALL_TAGS = "all"

function SessionsCard({
  sessions,
  page,
  onPage,
  tags,
  onTagChange,
}: {
  sessions: FocusHistoryResult["sessions"]
  page: number
  onPage: (page: number) => void
  tags: FocusHistoryResult["tags"]
  onTagChange: (tagId: string | null) => void
}) {
  const pageCount = Math.max(1, Math.ceil(sessions.totalRows / sessions.pageSize))
  const tagName = tags.find((tag) => tag.id === sessions.tagId)?.name
  return (
    <PanelCard
      label={
        tagName
          ? `Completed sessions · ${sessions.totalRows} tagged ${tagName} · ${formatFocusDuration(sessions.totalSeconds)}`
          : `Completed sessions · ${sessions.totalRows}`
      }
      aside={
        tags.length ? (
            <Select
              value={sessions.tagId ?? ALL_TAGS}
              onValueChange={(value) =>
                onTagChange(value === ALL_TAGS ? null : value)
              }
            >
              <SelectTrigger
                size="default"
                className="rounded-full text-xs"
                aria-label="Show sessions on tasks with this tag"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TAGS}>All tags</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    #{tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        ) : null
      }
    >
        {sessions.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:font-mono [&>th]:text-[11px] [&>th]:font-normal [&>th]:uppercase [&>th]:tracking-[0.15em] [&>th]:text-muted-foreground">
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
                  <TableCell className="font-mono">
                    {session.localTime}
                  </TableCell>
                  <TableCell
                    className={session.taskTitle ? "" : "text-muted-foreground"}
                  >
                    {session.taskTitle ?? "No task"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatFocusDuration(session.plannedSeconds)}
                  </TableCell>
                  <TableCell className="font-mono">
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
            {tagName
              ? `No completed focus in this range was on a task tagged ${tagName}.`
              : "No completed focus sessions in this range yet."}
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
    </PanelCard>
  )
}

/** The report page over 7 days, 30 days, 12 months or this year. */
export function HistoryPage({
  range,
  onRangeChange,
}: {
  /** From the address, so a reload or Back keeps it. */
  range: ReportRange
  onRangeChange: (range: ReportRange) => void
}) {
  const { authenticated } = useProductAuth()
  const [page, setPage] = React.useState(0)
  const [tagId, setTagId] = React.useState<string | null>(null)
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
  const week = useWeekReview(authenticated)
  const rangeLocked = isLongRangeReport(range) && longRangeUnlocked === false

  React.useEffect(() => {
    if (!authenticated || rangeLocked) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError("")
    loadFocusHistory({ range, page, tagId, timezone: browserTimezone() })
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
  }, [authenticated, range, page, tagId, rangeLocked, reloadKey])

  const changeRange = (next: ReportRange) => {
    if (next === range) return
    onRangeChange(next)
    setPage(0)
    setNotice("")
  }

  const exportCsv = async () => {
    setExporting(true)
    setNotice("")
    try {
      // The file holds what the table shows, so a tag filter narrows it too.
      const result = await exportFocusHistory({
        range,
        tagId,
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
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-col gap-2">
          <h2 className="title-halo text-4xl font-bold tracking-tight">Focus history</h2>
          <p className="title-halo text-muted-foreground">
            Your private record of completed focus sessions.
          </p>
        </header>
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <h3 className="text-lg font-bold">Sign in to see your history</h3>
            <p className="text-sm text-muted-foreground">
              Sign in and every focus is kept for you, which is what this page
              is built from. Your reports are private. Only you can see them.
            </p>
            <div className="flex gap-2">
              <SignInButton size="default" variant="default" />
              <Button asChild variant="outline">
                <Link to="/register">Create free account</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const todayRow = days.find((day) => day.localDate === today)

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="title-halo flex flex-col gap-2">
            <h2 className="text-4xl font-bold tracking-tight">Focus history</h2>
            <p className="text-muted-foreground">{rangeSummary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {loading ? (
              <span
                role="status"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
                Loading…
              </span>
            ) : null}
            <Tabs
              value={range}
              onValueChange={(value) => changeRange(value as ReportRange)}
            >
              <TabsList aria-label="Report range" className={pillTabsList}>
                {reportRanges.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={option}
                    className={pillTabsTrigger}
                  >
                    {reportRangeLabels[option]}
                    {isLongRangeReport(option) && longRangeUnlocked === false ? (
                      <LockKeyholeIcon aria-hidden="true" />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              className="h-12 rounded-full px-5"
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
        </header>

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
            {/* The 1px gap shows the line colour behind the cells, so the
                lines between them are right in two columns and in four. */}
            <dl
              aria-label="Range totals"
              className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border bg-[rgba(var(--p-fg-rgb),0.08)] md:grid-cols-4"
            >
              <StripFigure
                label="Focus time"
                value={formatFocusDuration(report.totals.focusSeconds)}
                hint={reportRangeLabels[report.range]}
              />
              <StripFigure
                label="Sessions"
                value={String(report.totals.focusSessions)}
                hint={`${formatFocusDuration(todayRow?.focusSeconds ?? 0)} today · ${todayRow?.focusSessions ?? 0} ${(todayRow?.focusSessions ?? 0) === 1 ? "session" : "sessions"}`}
              />
              <StripFigure
                label="Active days"
                value={String(report.totals.activeDays)}
                hint={`of ${days.length} days`}
              />
              <StripFigure
                label="Streak"
                value={
                  week.review
                    ? `${week.review.currentStreak} ${week.review.currentStreak === 1 ? "day" : "days"}`
                    : "…"
                }
                hint={
                  week.review
                    ? `best ${week.review.bestStreak} ${week.review.bestStreak === 1 ? "day" : "days"}`
                    : ""
                }
              />
            </dl>

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
                <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                  <ByDayPanel range={report.range} days={days} />
                  <ThisWeekPanel
                    review={week.review}
                    error={week.error}
                    loading={week.loading}
                    onRetry={week.retry}
                  />
                </div>
                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <HourOfDayPanel hours={report.hours} />
                  <WorkSplitPanel
                    topTasks={report.topTasks}
                    topProjects={report.topProjects}
                    projectTargets={report.projectTargets}
                    tasksCompleted={report.totals.tasksCompleted}
                  />
                </div>
                <SessionsCard
                  sessions={report.sessions}
                  page={page}
                  onPage={setPage}
                  tags={report.tags}
                  onTagChange={(next) => {
                    setTagId(next)
                    setPage(0)
                  }}
                />
              </>
            )}
          </>
        ) : null}

        {/* The ladder reads its own counters and ignores the range. */}
        <AchievementsCard />
      </div>
    </>
  )
}
