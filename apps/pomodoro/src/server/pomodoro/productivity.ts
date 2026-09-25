import { and, eq, gt, sql } from "drizzle-orm"

import { normalizeSessionNote } from "@/lib/pomodoro/session-notes"
import { db } from "@/server/db"
import {
  dailyFocusStats,
  focusSessions,
  tasks,
  userPreferences,
} from "@/server/pomodoro/schema"

/**
 * The timer's server half, ported from the old app
 * (apps/pomoder/src/server/productivity.ts). A session row follows the ring:
 * started when Start is pressed, paused and resumed with it, cancelled on
 * reset or a mode change, completed when the ring runs out. Finished focus
 * sessions feed the per-day stats row that goals, streaks and history read.
 */

type StartSessionInput = {
  mode: "focus" | "short" | "long"
  plannedSeconds: number
  taskId: string | null
  idempotencyKey: string
}

export async function startProductivitySession(
  userId: string,
  today: string,
  input: StartSessionInput
) {
  // Only a focus counts towards a task, and only one of today's active own
  // tasks may be claimed.
  const taskId = input.mode === "focus" ? input.taskId : null
  if (taskId) {
    const owned = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.status, "active"),
          eq(tasks.plannedDate, today)
        )
      )
      .limit(1)
    if (!owned.length) throw new Error("TASK_NOT_FOUND")
  }
  const [created] = await db
    .insert(focusSessions)
    .values({
      userId,
      ...input,
      taskId,
      targetEndsAt: new Date(Date.now() + input.plannedSeconds * 1_000),
    })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  // The duplicate guard: a retried start finds the row its key already made.
  const [existing] = await db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(focusSessions.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1)
  return existing
}

export async function completeProductivitySession(
  userId: string,
  sessionId: string,
  accumulatedSeconds: number,
  today: string
) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .update(focusSessions)
      .set({
        status: "completed",
        accumulatedSeconds,
        completedAt: new Date(),
        targetEndsAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(focusSessions.id, sessionId),
          eq(focusSessions.userId, userId),
          sql`${focusSessions.status} in ('running', 'paused')`
        )
      )
      .returning()
    if (!session) return null

    let updatedTask: { id: string; pomodoroCount: number } | null = null
    if (session.mode === "focus") {
      await tx
        .insert(dailyFocusStats)
        .values({
          userId,
          localDate: today,
          focusSessions: 1,
          focusSeconds: accumulatedSeconds,
        })
        .onConflictDoUpdate({
          target: [dailyFocusStats.userId, dailyFocusStats.localDate],
          set: {
            focusSessions: sql`${dailyFocusStats.focusSessions} + 1`,
            focusSeconds: sql`${dailyFocusStats.focusSeconds} + ${accumulatedSeconds}`,
            updatedAt: new Date(),
          },
        })
      if (session.taskId) {
        const [task] = await tx
          .update(tasks)
          .set({
            pomodoroCount: sql`${tasks.pomodoroCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, session.taskId),
              eq(tasks.userId, userId),
              eq(tasks.status, "active")
            )
          )
          .returning({ id: tasks.id, pomodoroCount: tasks.pomodoroCount })
        updatedTask = task ?? null
      }
    }
    return { session, task: updatedTask }
  })
}

/**
 * Writes the line about what a finished focus was for.
 *
 * Only the person's own completed focus sessions can take one: a break has
 * nothing to describe, and a session still running has not happened yet. An
 * empty note clears the line, so a note typed by mistake can be taken back.
 *
 * Refusing with SESSION_NOT_FOUND rather than saying which of those it was
 * keeps one account from learning anything about another's session ids.
 */
export async function saveSessionNote(
  userId: string,
  sessionId: string,
  note: string
) {
  const line = normalizeSessionNote(note)
  const [updated] = await db
    .update(focusSessions)
    .set({ note: line || null, updatedAt: new Date() })
    .where(
      and(
        eq(focusSessions.id, sessionId),
        eq(focusSessions.userId, userId),
        eq(focusSessions.mode, "focus"),
        eq(focusSessions.status, "completed")
      )
    )
    .returning({ id: focusSessions.id, note: focusSessions.note })
  if (!updated) throw new Error("SESSION_NOT_FOUND")
  return updated
}

export async function loadOrCreatePreferences(userId: string) {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(userPreferences)
    .values({ userId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { updatedAt: new Date() },
    })
    .returning()
  return created
}

/**
 * The user's calendar day in their own timezone, as `yyyy-mm-dd`. The
 * timezone string comes from the browser, so anything unrecognised falls
 * back to UTC rather than throwing a whole request away.
 */
export function localDateFor(timezone: string, timestamp = new Date()) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(timestamp)
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(timestamp)
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function localDateOrdinal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return Math.floor(date.getTime() / 86_400_000)
}

/**
 * Current and best streak from the days that had at least one finished
 * focus. A streak survives one empty day gap only when that day is today,
 * so yesterday's streak is still "current" until today ends without a focus.
 */
export function calculateFocusStreaks(
  orderedLocalDates: readonly string[],
  todayLocalDate: string
) {
  const today = localDateOrdinal(todayLocalDate)
  if (today === null) throw new Error("INVALID_LOCAL_DATE")
  const days = [
    ...new Set(
      orderedLocalDates
        .map(localDateOrdinal)
        .filter((day): day is number => day !== null && day <= today)
    ),
  ].sort((left, right) => left - right)
  let bestStreak = 0
  let run = 0
  let previous: number | null = null

  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run)
    previous = day
  }

  const latest = days.at(-1)
  if (latest === undefined || latest < today - 1)
    return { currentStreak: 0, bestStreak }
  let currentStreak = 1
  for (
    let index = days.length - 2;
    index >= 0 && days[index] === days[index + 1] - 1;
    index -= 1
  )
    currentStreak += 1
  return { currentStreak, bestStreak }
}

export function buildFocusSummary(
  dailyStats: readonly { localDate: string; focusSessions: number }[],
  todayLocalDate: string,
  dailyGoalSessions: number
) {
  const todayCompletedSessions =
    dailyStats.find((day) => day.localDate === todayLocalDate)?.focusSessions ??
    0
  return {
    ...calculateFocusStreaks(
      dailyStats
        .filter((day) => day.focusSessions > 0)
        .map((day) => day.localDate),
      todayLocalDate
    ),
    todayCompletedSessions,
    dailyGoalSessions,
    goalProgress: Math.min(1, todayCompletedSessions / dailyGoalSessions),
    goalCompleted: todayCompletedSessions >= dailyGoalSessions,
  }
}

/** The days with at least one finished focus, oldest first. */
async function loadActiveDays(userId: string) {
  return db
    .select({
      localDate: dailyFocusStats.localDate,
      focusSessions: dailyFocusStats.focusSessions,
    })
    .from(dailyFocusStats)
    .where(
      and(
        eq(dailyFocusStats.userId, userId),
        gt(dailyFocusStats.focusSessions, 0)
      )
    )
    .orderBy(dailyFocusStats.localDate)
}

/**
 * Current and best streak on their own, for the callers that want the streak
 * without a goal to measure it against: the badges panel and the public
 * streak badge.
 */
export async function loadFocusStreaks(
  userId: string,
  todayLocalDate: string
) {
  const days = await loadActiveDays(userId)
  return calculateFocusStreaks(
    days.map((day) => day.localDate),
    todayLocalDate
  )
}

export async function loadFocusSummary(
  userId: string,
  todayLocalDate: string,
  dailyGoalSessions: number
) {
  return buildFocusSummary(
    await loadActiveDays(userId),
    todayLocalDate,
    dailyGoalSessions
  )
}
