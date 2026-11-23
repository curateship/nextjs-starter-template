import * as React from "react"
import { Link, useRouteContext } from "@tanstack/react-router"
import { Download, Loader2, LockKeyhole } from "lucide-react"

import { exportFocusHistory, loadFocusHistory } from "@/lib/api/productivity"
import {
  formatFocusDuration,
  isLongRangeReport,
  reportRangeLabels,
  reportRanges,
  shiftLocalDate,
  type ReportRange,
} from "@/lib/focus-history"

type FocusHistoryResult = Awaited<ReturnType<typeof loadFocusHistory>>
type ReportDay = FocusHistoryResult["days"][number]

function dayLabel(localDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${localDate}T12:00:00`).toLocaleDateString(undefined, options)
}

// Fills calendar gaps so charts and the heatmap show honest zero days instead
// of skipping them. Ranges are bounded server-side, so this stays small.
function fillDays(startDate: string, endDate: string, days: readonly ReportDay[]) {
  const byDate = new Map(days.map((day) => [day.localDate, day]))
  const filled: ReportDay[] = []
  for (let date = startDate; date <= endDate; date = shiftLocalDate(date, 1)) {
    filled.push(byDate.get(date) ?? { localDate: date, focusSeconds: 0, focusSessions: 0, tasksCompleted: 0 })
  }
  return filled
}

function aggregateMonths(days: readonly ReportDay[]) {
  const months = new Map<string, { key: string; focusSeconds: number; focusSessions: number }>()
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

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

function HeatmapCard({ days, today }: { days: ReportDay[]; today: string }) {
  const maxSeconds = Math.max(...days.map((day) => day.focusSeconds), 0)
  // Monday-first column offset: getDay() is 0 for Sunday.
  const leadingBlanks = (new Date(`${days[0].localDate}T12:00:00`).getDay() + 6) % 7
  return (
    <section className="reference-week-chart history-heatmap-card" tabIndex={0} aria-label="Focus calendar heatmap">
      <header>
        <h3>Focus calendar</h3>
        <span>{formatFocusDuration(days.reduce((total, day) => total + day.focusSeconds, 0))} total</span>
      </header>
      <div className="history-heatmap" aria-hidden="true">
        <div className="heatmap-weekdays">
          {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        <div className="heatmap-grid">
          {Array.from({ length: leadingBlanks }, (_, index) => <i key={`blank-${index}`} className="heatmap-cell blank" />)}
          {days.map((day) => (
            <i
              key={day.localDate}
              className={`heatmap-cell level-${heatLevel(day.focusSeconds, maxSeconds)} ${day.localDate === today ? "today" : ""}`}
              title={`${dayLabel(day.localDate, { month: "short", day: "numeric" })} · ${formatFocusDuration(day.focusSeconds)} · ${day.focusSessions} ${day.focusSessions === 1 ? "session" : "sessions"}`}
            />
          ))}
        </div>
      </div>
      <div className="heatmap-scale" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heatmap-cell level-${level}`} />)}
        <span>More</span>
      </div>
      <DayTable caption="Daily focus totals" days={days} />
    </section>
  )
}

// Screen-reader equivalent for the visual charts; the visuals stay aria-hidden.
function DayTable({ caption, days }: { caption: string; days: readonly { localDate: string; focusSeconds: number; focusSessions: number }[] }) {
  return (
    <table className="visually-hidden">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Focus time</th><th scope="col">Sessions</th></tr></thead>
      <tbody>
        {days.filter((day) => day.focusSessions > 0).map((day) => (
          <tr key={day.localDate}><th scope="row">{day.localDate}</th><td>{formatFocusDuration(day.focusSeconds)}</td><td>{day.focusSessions}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

function TrendCard({ range, days, today }: { range: ReportRange; days: ReportDay[]; today: string }) {
  const monthly = isLongRangeReport(range)
  const bars = monthly
    ? aggregateMonths(days).map((month) => ({ key: month.key, current: month.key === today.slice(0, 7), label: dayLabel(`${month.key}-15`, { month: "short" }), title: `${dayLabel(`${month.key}-15`, { month: "short", year: "numeric" })} · ${formatFocusDuration(month.focusSeconds)} · ${month.focusSessions} ${month.focusSessions === 1 ? "session" : "sessions"}`, focusSeconds: month.focusSeconds, focusSessions: month.focusSessions }))
    : days.map((day, index) => ({ key: day.localDate, current: day.localDate === today, label: range === "7d" ? dayLabel(day.localDate, { weekday: "short" }) : index % 5 === 0 || day.localDate === today ? dayLabel(day.localDate, { day: "numeric" }) : "", title: `${dayLabel(day.localDate, { month: "short", day: "numeric" })} · ${formatFocusDuration(day.focusSeconds)} · ${day.focusSessions} ${day.focusSessions === 1 ? "session" : "sessions"}`, focusSeconds: day.focusSeconds, focusSessions: day.focusSessions }))
  const peakSeconds = Math.max(0, ...bars.map((bar) => bar.focusSeconds))
  const scaleSeconds = Math.max(1, peakSeconds)
  return (
    <section className="reference-week-chart history-trend-card" tabIndex={0} aria-label="Focus trend chart">
      <header>
        <h3>Focus time {monthly ? "by month" : "by day"}</h3>
        <span>peak {formatFocusDuration(peakSeconds)}</span>
      </header>
      <div className="reference-bars history-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }} aria-hidden="true">
        {bars.map((bar) => (
          <div key={bar.key} title={bar.title}>
            <i className={bar.current ? "today" : ""} style={{ height: `${Math.round((bar.focusSeconds / scaleSeconds) * 130) + 6}px` }} />
            <small>{bar.label || " "}</small>
          </div>
        ))}
      </div>
      <DayTable caption={monthly ? "Monthly focus totals" : "Daily focus totals"} days={bars.map((bar) => ({ localDate: bar.key, focusSeconds: bar.focusSeconds, focusSessions: bar.focusSessions }))} />
    </section>
  )
}

function TopTasksCard({ topTasks }: { topTasks: FocusHistoryResult["topTasks"] }) {
  const maxSeconds = Math.max(1, ...topTasks.map((task) => task.focusSeconds))
  return (
    <section className="history-top-tasks">
      <header><h3>Top tasks</h3><span>by focus time</span></header>
      {topTasks.length ? (
        <ul>
          {topTasks.map((task) => (
            <li key={task.taskId ?? "no-task"}>
              <span className={task.title ? "" : "history-no-task"}>{task.title ?? "No task"}</span>
              <i aria-hidden="true"><b style={{ width: `${Math.max(4, Math.round((task.focusSeconds / maxSeconds) * 100))}%` }} /></i>
              <small>{formatFocusDuration(task.focusSeconds)} · {task.sessions} {task.sessions === 1 ? "session" : "sessions"}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="history-muted">Focus sessions you complete will rank their tasks here.</p>
      )}
    </section>
  )
}

function SessionsCard({ sessions, page, onPage }: { sessions: FocusHistoryResult["sessions"]; page: number; onPage: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(sessions.totalRows / sessions.pageSize))
  return (
    <section className="history-sessions">
      <header><h3>Completed sessions</h3><span>{sessions.totalRows} in range</span></header>
      {sessions.rows.length ? (
        <div className="history-sessions-scroll" tabIndex={0} role="region" aria-label="Completed sessions table">
          <table>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Task</th><th scope="col">Planned</th><th scope="col">Focused</th></tr>
            </thead>
            <tbody>
              {sessions.rows.map((session) => (
                <tr key={session.id}>
                  <td>{dayLabel(session.localDate, { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td>{session.localTime}</td>
                  <td className={session.taskTitle ? "" : "history-no-task"}>{session.taskTitle ?? "No task"}</td>
                  <td>{formatFocusDuration(session.plannedSeconds)}</td>
                  <td>{formatFocusDuration(session.accumulatedSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="history-muted">No completed focus sessions in this range yet.</p>
      )}
      {pageCount > 1 ? (
        <footer className="history-pagination">
          <button className="outline-pill" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
          <span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
          <button className="outline-pill" disabled={page + 1 >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
        </footer>
      ) : null}
    </section>
  )
}

export function HistoryPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const [range, setRange] = React.useState<ReportRange>("7d")
  const [page, setPage] = React.useState(0)
  const [report, setReport] = React.useState<FocusHistoryResult | null>(null)
  const [loading, setLoading] = React.useState(Boolean(user))
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [exporting, setExporting] = React.useState(false)
  // null until the first response tells us; then gates long ranges up front.
  const [longRangeUnlocked, setLongRangeUnlocked] = React.useState<boolean | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestRef = React.useRef(0)
  const rangeLocked = isLongRangeReport(range) && longRangeUnlocked === false

  React.useEffect(() => {
    if (!user || rangeLocked) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError("")
    loadFocusHistory({ range, page })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setReport(result)
        setLongRangeUnlocked(result.longRangeUnlocked)
      })
      .catch((cause) => {
        if (requestRef.current !== requestId) return
        if (cause instanceof Error && cause.message.includes("PRO_REQUIRED")) setLongRangeUnlocked(false)
        else setError("Your focus history could not be loaded.")
      })
      .finally(() => { if (requestRef.current === requestId) setLoading(false) })
  }, [user, range, page, rangeLocked, reloadKey])

  if (!user) {
    return (
      <div className="reference-view history-reference-view">
        <div className="history-reference-inner">
          <header className="reference-page-heading"><h2>Focus history</h2><p>Your private record of completed focus sessions.</p></header>
          <section className="history-signin">
            <h3>Sign in to see your history</h3>
            <p>Focus history is built from sessions synced to your account, so there is nothing to show for guests. Your reports are private — only you can see them.</p>
            <div><Link to="/login" className="pill-button">Sign in</Link><Link to="/register" className="outline-pill">Create free account</Link></div>
          </section>
        </div>
      </div>
    )
  }

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
      const result = await exportFocusHistory(range)
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }))
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

  const days = report && !rangeLocked ? fillDays(report.startDate, report.endDate, report.days) : []
  const today = report?.endDate ?? ""
  const rangeSummary = report && !rangeLocked
    ? `${dayLabel(report.startDate, { month: "short", day: "numeric" })} – ${dayLabel(report.endDate, { month: "short", day: "numeric" })} · today updates as you complete sessions`
    : "Only completed focus sessions count — breaks and cancelled timers never do."
  const empty = Boolean(report) && !rangeLocked && report!.totals.focusSessions === 0 && report!.sessions.totalRows === 0

  return (
    <div className="reference-view history-reference-view">
      <div className="history-reference-inner">
        <header className="reference-page-heading">
          <h2>Focus history</h2>
          <p>{rangeSummary}</p>
        </header>

        <div className="history-controls">
          <div className="history-ranges" role="tablist" aria-label="Report range">
            {reportRanges.map((option) => (
              <button key={option} role="tab" aria-selected={range === option} className={range === option ? "active" : ""} onClick={() => changeRange(option)}>
                {reportRangeLabels[option]}
                {isLongRangeReport(option) && longRangeUnlocked === false ? <LockKeyhole aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          {loading ? <span className="history-loading" role="status"><Loader2 className="player-spinner" aria-hidden="true" />Loading…</span> : null}
          <button className="outline-pill history-export" disabled={exporting || rangeLocked || empty} onClick={() => void exportCsv()}>
            {exporting ? <Loader2 className="player-spinner" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Export CSV
          </button>
        </div>

        {error ? <p className="room-notice" role="alert">{error} <button className="outline-pill" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></p> : null}
        {notice ? <p className="room-notice" role="status">{notice}</p> : null}

        {rangeLocked ? (
          <section className="history-locked">
            <LockKeyhole aria-hidden="true" />
            <h3>Long-range reports are part of Pomoder Pro</h3>
            <p>Free accounts keep the 7- and 30-day reports. Upgrade to unlock the 12-month and yearly focus reports.</p>
            <div><Link to="/pricing" className="pill-button">See Pro plans</Link><button className="outline-pill" onClick={() => changeRange("30d")}>Back to 30 days</button></div>
          </section>
        ) : report ? (
          <>
            <section className="reference-stat-grid" aria-label="Range totals">
              <article><span>Focus time</span><strong>{formatFocusDuration(report.totals.focusSeconds)}</strong><small>{reportRangeLabels[report.range]}</small></article>
              <article><span>Focus sessions</span><strong>{report.totals.focusSessions}</strong><small>completed only</small></article>
              <article><span>Active days</span><strong>{report.totals.activeDays}</strong><small>of {days.length} days</small></article>
              <article><span>Tasks completed</span><strong>{report.totals.tasksCompleted}</strong><small>{reportRangeLabels[report.range]}</small></article>
            </section>

            {empty ? (
              <section className="history-empty">
                <h3>No focus history in this range yet</h3>
                <p>Complete a focus session and it will appear here within the day it finished. Breaks and cancelled timers are never counted.</p>
                <Link to="/" className="pill-button">Start a focus session</Link>
              </section>
            ) : (
              <>
                <HeatmapCard days={days} today={today} />
                <TrendCard range={report.range} days={days} today={today} />
                <TopTasksCard topTasks={report.topTasks} />
                <SessionsCard sessions={report.sessions} page={page} onPage={setPage} />
              </>
            )}
          </>
        ) : !error ? (
          <section className="history-empty"><p role="status">Loading your focus history…</p></section>
        ) : null}
      </div>
    </div>
  )
}
