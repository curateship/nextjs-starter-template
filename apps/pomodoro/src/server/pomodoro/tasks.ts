import { and, eq, lt, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { dailyFocusStats, tasks } from "@/server/pomodoro/schema"

/**
 * Today's task list, server side, ported from the old app's productivity
 * module. Tasks belong to one calendar day; the rollover that carries
 * unfinished ones forward arrives with the archive task.
 */

/**
 * Copies every still-active task from an earlier day onto today's list —
 * priority, estimate, done count and order intact — and marks each original
 * as carried, linked to its copy. No scheduled job: this runs whenever the
 * app loads the day's data, exactly like the old app.
 */
export async function rollOverTasks(userId: string, today: string) {
  return db.transaction(async (tx) => {
    const previous = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "active"),
          lt(tasks.plannedDate, today)
        )
      )
    for (const task of previous) {
      const [carried] = await tx
        .insert(tasks)
        .values({
          userId,
          title: task.title,
          plannedDate: today,
          pomodoroCount: task.pomodoroCount,
          priority: task.priority,
          estimatedPomodoros: task.estimatedPomodoros,
          sortOrder: task.sortOrder,
        })
        .returning({ id: tasks.id })
      await tx
        .update(tasks)
        .set({
          status: "carried",
          carriedToTaskId: carried.id,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id))
    }
    return previous.length
  })
}

export type TaskPlanChanges = {
  title?: string
  priority?: "low" | "normal" | "high"
  estimatedPomodoros?: number | null
}

export async function updateTaskPlan(
  userId: string,
  taskId: string,
  today: string,
  changes: TaskPlanChanges
) {
  const set: TaskPlanChanges & { updatedAt: Date } = { updatedAt: new Date() }
  if (changes.title !== undefined) set.title = changes.title
  if (changes.priority !== undefined) set.priority = changes.priority
  if (changes.estimatedPomodoros !== undefined)
    set.estimatedPomodoros = changes.estimatedPomodoros
  const [updated] = await db
    .update(tasks)
    .set(set)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        eq(tasks.status, "active"),
        eq(tasks.plannedDate, today)
      )
    )
    .returning()
  if (!updated) throw new Error("TASK_NOT_FOUND")
  return updated
}

/**
 * Rewrites the order of today's active tasks in one transaction. The payload
 * must name every active task exactly once, so concurrent edits either apply
 * a full valid order or fail loudly (TASK_ORDER_MISMATCH) for the client to
 * roll back and reload.
 */
export async function reorderTodayTasks(
  userId: string,
  today: string,
  orderedTaskIds: readonly string[]
) {
  return db.transaction(async (tx) => {
    const active = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "active"),
          eq(tasks.plannedDate, today)
        )
      )
      .for("update")
    const activeIds = new Set(active.map((row) => row.id))
    const uniqueIds = new Set(orderedTaskIds)
    const validOrder =
      uniqueIds.size === orderedTaskIds.length &&
      uniqueIds.size === activeIds.size &&
      orderedTaskIds.every((id) => activeIds.has(id))
    if (!validOrder) throw new Error("TASK_ORDER_MISMATCH")
    for (const [index, taskId] of orderedTaskIds.entries()) {
      await tx
        .update(tasks)
        .set({ sortOrder: index + 1, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    }
    return orderedTaskIds.length
  })
}

/** Complete or reopen, keeping the day's tasks-completed count in step. */
export async function toggleTaskStatus(
  userId: string,
  taskId: string,
  today: string
) {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1)
    if (!task || !["active", "completed"].includes(task.status))
      throw new Error("TASK_NOT_FOUND")
    const completed = task.status !== "completed"
    const [updated] = await tx
      .update(tasks)
      .set({
        status: completed ? "completed" : "active",
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)))
      .returning()
    if (completed) {
      await tx
        .insert(dailyFocusStats)
        .values({ userId, localDate: today, tasksCompleted: 1 })
        .onConflictDoUpdate({
          target: [dailyFocusStats.userId, dailyFocusStats.localDate],
          set: {
            tasksCompleted: sql`${dailyFocusStats.tasksCompleted} + 1`,
            updatedAt: new Date(),
          },
        })
    } else {
      await tx
        .update(dailyFocusStats)
        .set({
          tasksCompleted: sql`greatest(0, ${dailyFocusStats.tasksCompleted} - 1)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dailyFocusStats.userId, userId),
            eq(dailyFocusStats.localDate, today)
          )
        )
    }
    return updated
  })
}
