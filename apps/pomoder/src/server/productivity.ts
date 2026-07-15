import { and, eq, lt, sql } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { dailyFocusStats, tasks } from "@/server/schema"

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

export function localDateFor(timezone: string, timestamp = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
