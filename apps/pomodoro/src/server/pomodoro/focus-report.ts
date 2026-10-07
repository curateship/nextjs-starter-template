import { and, desc, eq, exists, gte, lt, lte, sql } from "drizzle-orm"

import { db } from "@/server/db"
import {
  resolveReportRange,
  shiftLocalDate,
  startOfWeek,
  type ReportRange,
} from "@/lib/pomodoro/focus-history"
import { loadFocusSummary, localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroProjects,
  pomodoroTags,
  pomodoroTaskTags,
  tasks,
} from "@/server/pomodoro/schema"

export const REPORT_SESSION_PAGE_SIZE = 20
export const REPORT_EXPORT_ROW_LIMIT = 20_000

function localClockAsUtc(timezone: string, timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.parse(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`)
}

// The instant at which a local calendar date begins in the given timezone.
// Fixed-point iteration over the zone offset converges in two steps; in the
// rare zones where DST skips midnight itself, the nearest valid instant wins.
export function localDateStartInstant(timezone: string, localDate: string) {
  const target = Date.parse(`${localDate}T00:00:00Z`)
  if (Number.isNaN(target)) throw new Error("INVALID_LOCAL_DATE")
  let guess = target
  for (let step = 0; step < 3; step += 1) {
    const drift = target - localClockAsUtc(timezone, guess)
    if (!drift) break
    guess += drift
  }
  return new Date(guess)
}

function localTimeFor(timezone: string, timestamp: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp)
}

// Productivity totals count completed focus-mode sessions only: breaks never
// count, and running, paused, or cancelled sessions have not produced focus.
// Exported because the public profile sums the same thing over its own seven
// days, and two definitions of "a finished focus" would eventually disagree.
export function completedFocusWithin(userId: string, startsAt: Date, endsBefore: Date) {
  return and(
    eq(focusSessions.userId, userId),
    eq(focusSessions.mode, "focus"),
    eq(focusSessions.status, "completed"),
    gte(focusSessions.completedAt, startsAt),
    lt(focusSessions.completedAt, endsBefore)
  )
}

/**
 * Only the sessions whose task carries this tag. The tag has to be the same
 * person's, so a tag id from another account matches nothing rather than
 * leaking whether it exists.
 */
function taggedWith(userId: string, tagId: string) {
  return exists(
    db
      .select({ taskId: pomodoroTaskTags.taskId })
      .from(pomodoroTaskTags)
      .innerJoin(pomodoroTags, eq(pomodoroTags.id, pomodoroTaskTags.tagId))
      .where(
        and(
          eq(pomodoroTaskTags.taskId, focusSessions.taskId),
          eq(pomodoroTaskTags.tagId, tagId),
          eq(pomodoroTags.userId, userId)
        )
      )
  )
}

function reportWindow(range: ReportRange, todayLocalDate: string, timezone: string) {
  const { startDate, endDate } = resolveReportRange(range, todayLocalDate)
  return {
    startDate,
    endDate,
    startsAt: localDateStartInstant(timezone, startDate),
    endsBefore: localDateStartInstant(timezone, shiftLocalDate(endDate, 1)),
  }
}

const HOURS_IN_DAY = 24

/**
 * The 24 hour buckets, every hour present whether it holds sessions or not, so
 * the chart always draws the same axis. The bucket is the local hour the
 * session finished in.
 */
function fillHours(rows: readonly { hour: number; sessions: number; focusSeconds: number }[]) {
  const byHour = new Map(rows.map((row) => [row.hour, row]))
  return Array.from({ length: HOURS_IN_DAY }, (_, hour) => byHour.get(hour) ?? { hour, sessions: 0, focusSeconds: 0 })
}

/**
 * The report for one range. `tagId` narrows the sessions table, its count and
 * the tagged total to sessions whose task carries that tag. The stats, chart
 * and splits above it stay whole, because they are read from the per-day
 * totals, which know nothing of tags.
 */
export async function loadFocusReport(userId: string, range: ReportRange, todayLocalDate: string, timezone: string, page = 0, tagId: string | null = null) {
  const { startDate, endDate, startsAt, endsBefore } = reportWindow(range, todayLocalDate, timezone)
  const filter = completedFocusWithin(userId, startsAt, endsBefore)
  const sessionFilter = tagId ? and(filter, taggedWith(userId, tagId)) : filter
  const offset = Math.max(0, page) * REPORT_SESSION_PAGE_SIZE

  const [days, topTasks, topProjects, hourRows, sessionRows, [sessionCount]] = await Promise.all([
    db
      .select({ localDate: dailyFocusStats.localDate, focusSeconds: dailyFocusStats.focusSeconds, focusSessions: dailyFocusStats.focusSessions, tasksCompleted: dailyFocusStats.tasksCompleted })
      .from(dailyFocusStats)
      .where(and(eq(dailyFocusStats.userId, userId), gte(dailyFocusStats.localDate, startDate), lte(dailyFocusStats.localDate, endDate)))
      .orderBy(dailyFocusStats.localDate),
    // Grouping by task id keeps every unassigned or since-deleted-task session
    // in one neutral bucket (null title) instead of leaking or dropping rows.
    db
      .select({ taskId: focusSessions.taskId, title: sql<string | null>`max(${tasks.title})`, sessions: sql<number>`count(*)::int`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(filter)
      .groupBy(focusSessions.taskId)
      .orderBy(desc(sql`sum(${focusSessions.accumulatedSeconds})`))
      .limit(8),
    // The same rows grouped one level up. A session reaches a project through
    // its task, so a session on no task, or on a task in no project, lands in
    // one neutral bucket (null id) rather than being dropped. An archived
    // project still answers here: leaving the picker never erases its hours.
    db
      .select({ projectId: tasks.projectId, name: sql<string | null>`max(${pomodoroProjects.name})`, sessions: sql<number>`count(*)::int`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .leftJoin(pomodoroProjects, eq(pomodoroProjects.id, tasks.projectId))
      .where(filter)
      .groupBy(tasks.projectId)
      .orderBy(desc(sql`sum(${focusSessions.accumulatedSeconds})`))
      .limit(8),
    // The hour of day each focus finished in, in the profile's timezone. This
    // one date calculation runs in SQL rather than JS because the alternative
    // is fetching every session row in the range only to count them, and
    // Postgres and Intl read the same IANA zone names. The zone is a bound
    // parameter, and it is only ever a zone `validTimezone` accepted.
    db
      .select({ hour: sql<number>`extract(hour from ${focusSessions.completedAt} at time zone ${timezone}::text)::int`, sessions: sql<number>`count(*)::int`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` })
      .from(focusSessions)
      .where(filter)
      // The first selected column, so the hour expression is written once.
      .groupBy(sql`1`),
    db
      .select({ id: focusSessions.id, completedAt: focusSessions.completedAt, plannedSeconds: focusSessions.plannedSeconds, accumulatedSeconds: focusSessions.accumulatedSeconds, taskTitle: tasks.title, note: focusSessions.note })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(sessionFilter)
      .orderBy(desc(focusSessions.completedAt), desc(focusSessions.id))
      .limit(REPORT_SESSION_PAGE_SIZE)
      .offset(offset),
    db.select({ value: sql<number>`count(*)::int`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` }).from(focusSessions).where(sessionFilter),
  ])

  const totals = { focusSeconds: 0, focusSessions: 0, tasksCompleted: 0, activeDays: 0 }
  for (const day of days) {
    totals.focusSeconds += day.focusSeconds
    totals.focusSessions += day.focusSessions
    totals.tasksCompleted += day.tasksCompleted
    if (day.focusSessions > 0) totals.activeDays += 1
  }

  return {
    range,
    startDate,
    endDate,
    days,
    totals,
    topTasks,
    topProjects,
    hours: fillHours(hourRows),
    sessions: {
      rows: sessionRows.map((row) => {
        const completedAt = row.completedAt ?? new Date(0)
        return { id: row.id, taskTitle: row.taskTitle, note: row.note, plannedSeconds: row.plannedSeconds, accumulatedSeconds: row.accumulatedSeconds, localDate: localDateFor(timezone, completedAt), localTime: localTimeFor(timezone, completedAt) }
      }),
      page,
      pageSize: REPORT_SESSION_PAGE_SIZE,
      totalRows: sessionCount.value,
      totalSeconds: sessionCount.focusSeconds,
      tagId,
    },
  }
}

// The full (still range-bounded) session list backing CSV export, oldest
// first so the spreadsheet reads chronologically.
export async function loadFocusReportSessions(userId: string, range: ReportRange, todayLocalDate: string, timezone: string, tagId: string | null = null) {
  const { startDate, endDate, startsAt, endsBefore } = reportWindow(range, todayLocalDate, timezone)
  const rows = await db
    .select({ completedAt: focusSessions.completedAt, plannedSeconds: focusSessions.plannedSeconds, accumulatedSeconds: focusSessions.accumulatedSeconds, taskTitle: tasks.title, note: focusSessions.note })
    .from(focusSessions)
    .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(tagId ? and(completedFocusWithin(userId, startsAt, endsBefore), taggedWith(userId, tagId)) : completedFocusWithin(userId, startsAt, endsBefore))
    .orderBy(focusSessions.completedAt, focusSessions.id)
    .limit(REPORT_EXPORT_ROW_LIMIT)
  return {
    startDate,
    endDate,
    rows: rows.map((row) => {
      const completedAt = row.completedAt ?? new Date(0)
      return { localDate: localDateFor(timezone, completedAt), localTime: localTimeFor(timezone, completedAt), taskTitle: row.taskTitle, note: row.note, plannedSeconds: row.plannedSeconds, accumulatedSeconds: row.accumulatedSeconds }
    }),
  }
}

/**
 * This week against last week, the best day of this week, the project that
 * took the most of this week's focus, the hour most of this week's sessions
 * finished in, and the current and best streak. The History page's top strip
 * and its This week card both read it, so none of it moves with the range
 * tabs.
 *
 * Both weeks come from one read of `daily_focus_stats` over the fourteen-day
 * window and are split by date in JS, so the comparison never costs two
 * queries. The week runs Monday to Sunday (`startOfWeek`).
 *
 * "There is no last week" means the account had recorded nothing at all before
 * last Monday. That is one row read through the per-account date index, not a
 * scan of the whole history. An account that was quiet last week but active
 * before it has a last week of zero, which is a real comparison and is shown
 * as one.
 */
export async function loadWeekReview(userId: string, todayLocalDate: string, timezone: string) {
  const weekStart = startOfWeek(todayLocalDate)
  const lastWeekStart = shiftLocalDate(weekStart, -7)
  const weekStartsAt = localDateStartInstant(timezone, weekStart)
  const weekEndsBefore = localDateStartInstant(timezone, shiftLocalDate(todayLocalDate, 1))

  const [rows, earlier, topProjects, topHours, summary] = await Promise.all([
    db
      .select({ localDate: dailyFocusStats.localDate, focusSeconds: dailyFocusStats.focusSeconds })
      .from(dailyFocusStats)
      .where(and(eq(dailyFocusStats.userId, userId), gte(dailyFocusStats.localDate, lastWeekStart), lte(dailyFocusStats.localDate, todayLocalDate)))
      .orderBy(dailyFocusStats.localDate),
    db
      .select({ localDate: dailyFocusStats.localDate })
      .from(dailyFocusStats)
      .where(and(eq(dailyFocusStats.userId, userId), lt(dailyFocusStats.localDate, lastWeekStart)))
      .orderBy(desc(dailyFocusStats.localDate))
      .limit(1),
    // The project that took the most of this week, reached the same way the
    // report's own project split reaches one: through the session's task. A
    // session on no task, or on a task in no project, is the "No project" row
    // rather than a dropped row.
    db
      .select({ projectId: tasks.projectId, name: sql<string | null>`max(${pomodoroProjects.name})`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .leftJoin(pomodoroProjects, eq(pomodoroProjects.id, tasks.projectId))
      .where(completedFocusWithin(userId, weekStartsAt, weekEndsBefore))
      .groupBy(tasks.projectId)
      .orderBy(desc(sql`sum(${focusSessions.accumulatedSeconds})`))
      .limit(1),
    // The local hour most of this week's sessions finished in, counted the
    // same way the report's hour chart counts. A tie goes to the earlier hour.
    db
      .select({ hour: sql<number>`extract(hour from ${focusSessions.completedAt} at time zone ${timezone}::text)::int`, sessions: sql<number>`count(*)::int` })
      .from(focusSessions)
      .where(completedFocusWithin(userId, weekStartsAt, weekEndsBefore))
      .groupBy(sql`1`)
      .orderBy(desc(sql`count(*)`), sql`1`)
      .limit(1),
    // The goal does not touch the streaks, so any goal will do here.
    loadFocusSummary(userId, todayLocalDate, 1),
  ])

  let thisWeekSeconds = 0
  let lastWeekSeconds = 0
  let lastWeekDays = 0
  let bestDay: { localDate: string; focusSeconds: number } | null = null
  for (const row of rows) {
    if (row.localDate < weekStart) {
      lastWeekSeconds += row.focusSeconds
      lastWeekDays += 1
      continue
    }
    thisWeekSeconds += row.focusSeconds
    if (row.focusSeconds > 0 && (!bestDay || row.focusSeconds > bestDay.focusSeconds))
      bestDay = { localDate: row.localDate, focusSeconds: row.focusSeconds }
  }

  const [topProject] = topProjects
  return {
    weekStart,
    endDate: todayLocalDate,
    thisWeekSeconds,
    lastWeekSeconds,
    hasLastWeek: lastWeekDays > 0 || earlier.length > 0,
    bestDay,
    topProject: topProject && topProject.focusSeconds > 0 ? { name: topProject.name, focusSeconds: topProject.focusSeconds } : null,
    busiestHour: topHours[0]?.hour ?? null,
    currentStreak: summary.currentStreak,
    bestStreak: summary.bestStreak,
  }
}
