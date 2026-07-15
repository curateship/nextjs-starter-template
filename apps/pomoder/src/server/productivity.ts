import { and, eq, gt, lt, sql } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { dailyFocusStats, focusSessions, tasks } from "@/server/schema"

type StartProductivitySessionInput = {
  mode: "focus" | "short" | "long"
  plannedSeconds: number
  taskId: string | null
  idempotencyKey: string
}

export async function startProductivitySession(userId: string, today: string, input: StartProductivitySessionInput, database: PomoderDb = db) {
  const taskId = input.mode === "focus" ? input.taskId : null
  if (taskId) {
    const owned = await database.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.status, "active"), eq(tasks.plannedDate, today))).limit(1)
    if (!owned.length) throw new Error("TASK_NOT_FOUND")
  }
  const [created] = await database.insert(focusSessions).values({ userId, ...input, taskId, targetEndsAt: new Date(Date.now() + input.plannedSeconds * 1_000) }).onConflictDoNothing().returning()
  if (created) return created
  const [existing] = await database.select().from(focusSessions).where(and(eq(focusSessions.userId, userId), eq(focusSessions.idempotencyKey, input.idempotencyKey))).limit(1)
  return existing
}

export async function rollOverTasks(userId: string, today: string, database: PomoderDb = db) {
  return database.transaction(async (tx) => {
    const previous = await tx.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "active"), lt(tasks.plannedDate, today)))
    for (const task of previous) {
      const [carried] = await tx.insert(tasks).values({ userId, title: task.title, plannedDate: today, pomodoroCount: task.pomodoroCount }).returning({ id: tasks.id })
      await tx.update(tasks).set({ status: "carried", carriedToTaskId: carried.id, updatedAt: new Date() }).where(eq(tasks.id, task.id))
    }
    return previous.length
  })
}

export async function toggleTaskStatus(userId: string, taskId: string, today: string, database: PomoderDb = db) {
  return database.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1)
    if (!task || !["active", "completed"].includes(task.status)) throw new Error("TASK_NOT_FOUND")
    const completed = task.status !== "completed"
    const [updated] = await tx.update(tasks).set({ status: completed ? "completed" : "active", completedAt: completed ? new Date() : null, updatedAt: new Date() }).where(and(eq(tasks.id, task.id), eq(tasks.userId, userId))).returning()
    if (completed) {
      await tx.insert(dailyFocusStats).values({ userId, localDate: today, tasksCompleted: 1 }).onConflictDoUpdate({ target: [dailyFocusStats.userId, dailyFocusStats.localDate], set: { tasksCompleted: sql`${dailyFocusStats.tasksCompleted} + 1`, updatedAt: new Date() } })
    } else {
      await tx.update(dailyFocusStats).set({ tasksCompleted: sql`greatest(0, ${dailyFocusStats.tasksCompleted} - 1)`, updatedAt: new Date() }).where(and(eq(dailyFocusStats.userId, userId), eq(dailyFocusStats.localDate, today)))
    }
    return updated
  })
}

export async function completeProductivitySession(userId: string, sessionId: string, accumulatedSeconds: number, today: string, database: PomoderDb = db) {
  return database.transaction(async (tx) => {
    const [session] = await tx.update(focusSessions).set({ status: "completed", accumulatedSeconds, completedAt: new Date(), targetEndsAt: null, updatedAt: new Date() }).where(and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId), sql`${focusSessions.status} in ('running', 'paused')`)).returning()
    if (!session) return null

    let updatedTask: { id: string; pomodoroCount: number } | null = null
    if (session.mode === "focus") {
      await tx.insert(dailyFocusStats).values({ userId, localDate: today, focusSessions: 1, focusSeconds: accumulatedSeconds }).onConflictDoUpdate({ target: [dailyFocusStats.userId, dailyFocusStats.localDate], set: { focusSessions: sql`${dailyFocusStats.focusSessions} + 1`, focusSeconds: sql`${dailyFocusStats.focusSeconds} + ${accumulatedSeconds}`, updatedAt: new Date() } })
      if (session.taskId) {
        const [task] = await tx.update(tasks).set({ pomodoroCount: sql`${tasks.pomodoroCount} + 1`, updatedAt: new Date() }).where(and(eq(tasks.id, session.taskId), eq(tasks.userId, userId), eq(tasks.status, "active"))).returning({ id: tasks.id, pomodoroCount: tasks.pomodoroCount })
        updatedTask = task ?? null
      }
    }
    return { session, task: updatedTask }
  })
}

export function localDateFor(timezone: string, timestamp = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp)
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
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.floor(date.getTime() / 86_400_000)
}

export function calculateFocusStreaks(orderedLocalDates: readonly string[], todayLocalDate: string) {
  const today = localDateOrdinal(todayLocalDate)
  if (today === null) throw new Error("INVALID_LOCAL_DATE")
  const days = [...new Set(orderedLocalDates.map(localDateOrdinal).filter((day): day is number => day !== null && day <= today))].sort((left, right) => left - right)
  let bestStreak = 0
  let run = 0
  let previous: number | null = null

  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run)
    previous = day
  }

  const latest = days.at(-1)
  if (latest === undefined || latest < today - 1) return { currentStreak: 0, bestStreak }
  let currentStreak = 1
  for (let index = days.length - 2; index >= 0 && days[index] === days[index + 1] - 1; index -= 1) currentStreak += 1
  return { currentStreak, bestStreak }
}

export function buildFocusSummary(dailyStats: readonly { localDate: string; focusSessions: number }[], todayLocalDate: string, dailyGoalSessions: number) {
  const todayCompletedSessions = dailyStats.find((day) => day.localDate === todayLocalDate)?.focusSessions ?? 0
  return {
    ...calculateFocusStreaks(dailyStats.filter((day) => day.focusSessions > 0).map((day) => day.localDate), todayLocalDate),
    todayCompletedSessions,
    dailyGoalSessions,
    goalProgress: Math.min(1, todayCompletedSessions / dailyGoalSessions),
    goalCompleted: todayCompletedSessions >= dailyGoalSessions,
  }
}

export async function loadFocusSummary(userId: string, todayLocalDate: string, dailyGoalSessions: number, database: PomoderDb = db) {
  const dailyStats = await database.select({ localDate: dailyFocusStats.localDate, focusSessions: dailyFocusStats.focusSessions }).from(dailyFocusStats).where(and(eq(dailyFocusStats.userId, userId), gt(dailyFocusStats.focusSessions, 0))).orderBy(dailyFocusStats.localDate)
  return buildFocusSummary(dailyStats, todayLocalDate, dailyGoalSessions)
}
