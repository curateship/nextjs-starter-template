import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { resolveReportRange, shiftLocalDate, type ReportRange } from "@/lib/focus-history"
import { localDateFor } from "@/server/productivity"
import { dailyFocusStats, focusSessions, tasks } from "@/server/schema"

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
function completedFocusWithin(userId: string, startsAt: Date, endsBefore: Date) {
  return and(
    eq(focusSessions.userId, userId),
    eq(focusSessions.mode, "focus"),
    eq(focusSessions.status, "completed"),
    gte(focusSessions.completedAt, startsAt),
    lt(focusSessions.completedAt, endsBefore)
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

export async function loadFocusReport(userId: string, range: ReportRange, todayLocalDate: string, timezone: string, page = 0, database: PomoderDb = db) {
  const { startDate, endDate, startsAt, endsBefore } = reportWindow(range, todayLocalDate, timezone)
  const filter = completedFocusWithin(userId, startsAt, endsBefore)
  const offset = Math.max(0, page) * REPORT_SESSION_PAGE_SIZE

  const [days, topTasks, sessionRows, [sessionCount]] = await Promise.all([
    database
      .select({ localDate: dailyFocusStats.localDate, focusSeconds: dailyFocusStats.focusSeconds, focusSessions: dailyFocusStats.focusSessions, tasksCompleted: dailyFocusStats.tasksCompleted })
      .from(dailyFocusStats)
      .where(and(eq(dailyFocusStats.userId, userId), gte(dailyFocusStats.localDate, startDate), lte(dailyFocusStats.localDate, endDate)))
      .orderBy(dailyFocusStats.localDate),
    // Grouping by task id keeps every unassigned or since-deleted-task session
    // in one neutral bucket (null title) instead of leaking or dropping rows.
    database
      .select({ taskId: focusSessions.taskId, title: sql<string | null>`max(${tasks.title})`, sessions: sql<number>`count(*)::int`, focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int` })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(filter)
      .groupBy(focusSessions.taskId)
      .orderBy(desc(sql`sum(${focusSessions.accumulatedSeconds})`))
      .limit(8),
    database
      .select({ id: focusSessions.id, completedAt: focusSessions.completedAt, plannedSeconds: focusSessions.plannedSeconds, accumulatedSeconds: focusSessions.accumulatedSeconds, taskTitle: tasks.title })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(filter)
      .orderBy(desc(focusSessions.completedAt), desc(focusSessions.id))
      .limit(REPORT_SESSION_PAGE_SIZE)
      .offset(offset),
    database.select({ value: sql<number>`count(*)::int` }).from(focusSessions).where(filter),
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
    sessions: {
      rows: sessionRows.map((row) => {
        const completedAt = row.completedAt ?? new Date(0)
        return { id: row.id, taskTitle: row.taskTitle, plannedSeconds: row.plannedSeconds, accumulatedSeconds: row.accumulatedSeconds, localDate: localDateFor(timezone, completedAt), localTime: localTimeFor(timezone, completedAt) }
      }),
      page,
      pageSize: REPORT_SESSION_PAGE_SIZE,
      totalRows: sessionCount.value,
    },
  }
}

// The full (still range-bounded) session list backing CSV export, oldest
// first so the spreadsheet reads chronologically.
export async function loadFocusReportSessions(userId: string, range: ReportRange, todayLocalDate: string, timezone: string, database: PomoderDb = db) {
  const { startDate, endDate, startsAt, endsBefore } = reportWindow(range, todayLocalDate, timezone)
  const rows = await database
    .select({ completedAt: focusSessions.completedAt, plannedSeconds: focusSessions.plannedSeconds, accumulatedSeconds: focusSessions.accumulatedSeconds, taskTitle: tasks.title })
    .from(focusSessions)
    .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(completedFocusWithin(userId, startsAt, endsBefore))
    .orderBy(focusSessions.completedAt, focusSessions.id)
    .limit(REPORT_EXPORT_ROW_LIMIT)
  return {
    startDate,
    endDate,
    rows: rows.map((row) => {
      const completedAt = row.completedAt ?? new Date(0)
      return { localDate: localDateFor(timezone, completedAt), localTime: localTimeFor(timezone, completedAt), taskTitle: row.taskTitle, plannedSeconds: row.plannedSeconds, accumulatedSeconds: row.accumulatedSeconds }
    }),
  }
}
