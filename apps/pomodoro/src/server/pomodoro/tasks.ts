import { and, eq, isNull, lt, sql } from "drizzle-orm"

import { repeatsOnLocalDate } from "@/lib/pomodoro/task-repeats"
import { db } from "@/server/db"
import {
  dailyFocusStats,
  pomodoroProjects,
  pomodoroTaskRepeats,
  tasks,
} from "@/server/pomodoro/schema"

/**
 * Today's task list, server side, ported from the old app's productivity
 * module. Tasks belong to one calendar day; the rollover carries unfinished
 * ones forward and asks each repeat rule for the day's copy.
 */

/**
 * Builds today's list. Two things happen, in this order and in one
 * transaction:
 *
 * 1. Every still-active task from an earlier day is copied onto today —
 *    priority, estimate, project, repeat rule, done count and order intact —
 *    and the original is marked carried, linked to its copy.
 * 2. Every repeat rule that names today's weekday gets its copy, unless the
 *    day already holds a task from that rule.
 *
 * Step 1 running first is what stops a carried copy and a repeat rule making
 * the same task twice: the carried copy keeps the rule's id, so step 2 finds
 * it and leaves it alone. The database backs that up with a unique index on
 * (repeat_id, planned_date), so two tabs loading the day at the same moment
 * still end up with one copy.
 *
 * No scheduled job: this runs whenever the app loads the day's data, exactly
 * like the old app.
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
          projectId: task.projectId,
          repeatId: task.repeatId,
          sortOrder: task.sortOrder,
        })
        // Today may already hold this rule's copy, made by a tab that loaded
        // the day a moment earlier. The old task still becomes carried; it
        // just points at the copy that is already there.
        .onConflictDoNothing()
        .returning({ id: tasks.id })
      const carriedToTaskId = carried?.id ?? (await existingRepeatCopy(tx, task.repeatId, today))
      await tx
        .update(tasks)
        .set({
          status: "carried",
          carriedToTaskId,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id))
    }

    const rules = await tx
      .select()
      .from(pomodoroTaskRepeats)
      .where(eq(pomodoroTaskRepeats.userId, userId))
    let created = 0
    for (const rule of rules) {
      if (!repeatsOnLocalDate(rule.weekdays, today)) continue
      const [made] = await tx
        .insert(tasks)
        .values({
          userId,
          title: rule.title,
          plannedDate: today,
          priority: rule.priority,
          estimatedPomodoros: rule.estimatedPomodoros,
          projectId: rule.projectId,
          repeatId: rule.id,
          sortOrder: sql`(select coalesce(max(${tasks.sortOrder}), 0) + 1 from ${tasks} where ${tasks.userId} = ${userId} and ${tasks.plannedDate} = ${today})`,
        })
        .onConflictDoNothing()
        .returning({ id: tasks.id })
      if (made) created += 1
    }
    return { carried: previous.length, created }
  })
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function existingRepeatCopy(
  tx: Transaction,
  repeatId: string | null,
  today: string
) {
  if (!repeatId) return null
  const [existing] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.repeatId, repeatId), eq(tasks.plannedDate, today)))
    .limit(1)
  return existing?.id ?? null
}

export type TaskPlanChanges = {
  title?: string
  priority?: "low" | "normal" | "high"
  estimatedPomodoros?: number | null
  projectId?: string | null
}

/**
 * Edits today's copy of a task. When the task repeats, the same edit is
 * written to its rule, so tomorrow's copy is the task you just changed rather
 * than the one you typed weeks ago.
 */
export async function updateTaskPlan(
  userId: string,
  taskId: string,
  today: string,
  changes: TaskPlanChanges
) {
  if (changes.projectId) await assertLiveProject(userId, changes.projectId)
  const set: TaskPlanChanges & { updatedAt: Date } = { updatedAt: new Date() }
  if (changes.title !== undefined) set.title = changes.title
  if (changes.priority !== undefined) set.priority = changes.priority
  if (changes.estimatedPomodoros !== undefined)
    set.estimatedPomodoros = changes.estimatedPomodoros
  if (changes.projectId !== undefined) set.projectId = changes.projectId
  return db.transaction(async (tx) => {
    const [updated] = await tx
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
    if (updated.repeatId)
      await tx
        .update(pomodoroTaskRepeats)
        .set({
          title: updated.title,
          priority: updated.priority,
          estimatedPomodoros: updated.estimatedPomodoros,
          projectId: updated.projectId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pomodoroTaskRepeats.id, updated.repeatId),
            eq(pomodoroTaskRepeats.userId, userId)
          )
        )
    return updated
  })
}

async function assertLiveProject(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: pomodoroProjects.id })
    .from(pomodoroProjects)
    .where(
      and(
        eq(pomodoroProjects.id, projectId),
        eq(pomodoroProjects.userId, userId),
        isNull(pomodoroProjects.archivedAt)
      )
    )
    .limit(1)
  if (!project) throw new Error("PROJECT_NOT_FOUND")
}

/**
 * Switches a task's repeat on, changes its picked days, or switches it off.
 * `weekdays` of null means off: the rule row is deleted, which stops future
 * copies and — through `on delete set null` — leaves every task it already
 * made exactly where it is.
 */
export async function setTaskRepeat(
  userId: string,
  taskId: string,
  today: string,
  weekdays: number | null
) {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
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
    if (!task) throw new Error("TASK_NOT_FOUND")

    if (weekdays === null) {
      if (!task.repeatId) return { ...task, weekdays: null }
      await tx
        .delete(pomodoroTaskRepeats)
        .where(
          and(
            eq(pomodoroTaskRepeats.id, task.repeatId),
            eq(pomodoroTaskRepeats.userId, userId)
          )
        )
      return { ...task, repeatId: null, weekdays: null }
    }

    const template = {
      title: task.title,
      priority: task.priority,
      estimatedPomodoros: task.estimatedPomodoros,
      projectId: task.projectId,
      weekdays,
      updatedAt: new Date(),
    }
    if (task.repeatId) {
      await tx
        .update(pomodoroTaskRepeats)
        .set(template)
        .where(
          and(
            eq(pomodoroTaskRepeats.id, task.repeatId),
            eq(pomodoroTaskRepeats.userId, userId)
          )
        )
      return { ...task, weekdays }
    }
    const [rule] = await tx
      .insert(pomodoroTaskRepeats)
      .values({ userId, ...template })
      .returning({ id: pomodoroTaskRepeats.id })
    const [linked] = await tx
      .update(tasks)
      .set({ repeatId: rule.id, updatedAt: new Date() })
      .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)))
      .returning()
    return { ...linked, weekdays }
  })
}

/** Today's tasks with the weekday set of the rule behind each, when there is one. */
export function listTasksForDay(userId: string, localDate: string) {
  return db
    .select({
      task: tasks,
      repeatWeekdays: pomodoroTaskRepeats.weekdays,
      projectName: pomodoroProjects.name,
    })
    .from(tasks)
    .leftJoin(
      pomodoroTaskRepeats,
      eq(pomodoroTaskRepeats.id, tasks.repeatId)
    )
    .leftJoin(pomodoroProjects, eq(pomodoroProjects.id, tasks.projectId))
    .where(and(eq(tasks.userId, userId), eq(tasks.plannedDate, localDate)))
    .orderBy(tasks.sortOrder, tasks.createdAt)
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
