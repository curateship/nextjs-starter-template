import { and, asc, eq, exists, inArray, sql } from "drizzle-orm"

import { MAX_TASK_STEPS } from "@/lib/pomodoro/task-steps"
import { db } from "@/server/db"
import { pomodoroTaskSteps, tasks } from "@/server/pomodoro/schema"

/**
 * Steps inside a task. Every query is keyed on the signed-in user's id as well
 * as the row id, so a step id from the browser only ever reaches that
 * person's own rows. A step can only change while its task is still active;
 * a finished or removed task keeps its steps exactly as they were.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The steps under each of these tasks, in their order. */
export function listStepsForTasks(taskIds: readonly string[]) {
  if (!taskIds.length) return Promise.resolve([])
  return db
    .select({
      id: pomodoroTaskSteps.id,
      taskId: pomodoroTaskSteps.taskId,
      title: pomodoroTaskSteps.title,
      done: pomodoroTaskSteps.done,
    })
    .from(pomodoroTaskSteps)
    .where(inArray(pomodoroTaskSteps.taskId, [...taskIds]))
    .orderBy(asc(pomodoroTaskSteps.sortOrder), asc(pomodoroTaskSteps.createdAt))
}

/**
 * Adds a step at the bottom. The task row is locked first, so two quick
 * presses cannot both read nine steps and both add a tenth and eleventh.
 */
export async function addTaskStep(userId: string, taskId: string, title: string) {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          eq(tasks.status, "active")
        )
      )
      .for("update")
    if (!task) throw new Error("TASK_NOT_FOUND")
    const [{ count, last }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        last: sql<number>`coalesce(max(${pomodoroTaskSteps.sortOrder}), 0)::int`,
      })
      .from(pomodoroTaskSteps)
      .where(eq(pomodoroTaskSteps.taskId, taskId))
    if (count >= MAX_TASK_STEPS) throw new Error("TOO_MANY_STEPS")
    const [step] = await tx
      .insert(pomodoroTaskSteps)
      .values({ taskId, userId, title, sortOrder: last + 1 })
      .returning({
        id: pomodoroTaskSteps.id,
        title: pomodoroTaskSteps.title,
        done: pomodoroTaskSteps.done,
      })
    return step
  })
}

/** The step, when it is this person's and its task is still active. */
function ownLiveStep(userId: string, stepId: string) {
  return and(
    eq(pomodoroTaskSteps.id, stepId),
    eq(pomodoroTaskSteps.userId, userId),
    // The query builder, not a hand-written subquery, so both sides of the
    // join come out qualified with their table.
    exists(
      db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, pomodoroTaskSteps.taskId),
            eq(tasks.status, "active")
          )
        )
    )
  )
}

export async function updateTaskStep(
  userId: string,
  stepId: string,
  changes: { title?: string; done?: boolean }
) {
  const [step] = await db
    .update(pomodoroTaskSteps)
    .set({ ...changes, updatedAt: new Date() })
    .where(ownLiveStep(userId, stepId))
    .returning({
      id: pomodoroTaskSteps.id,
      title: pomodoroTaskSteps.title,
      done: pomodoroTaskSteps.done,
    })
  if (!step) throw new Error("STEP_NOT_FOUND")
  return step
}

export async function deleteTaskStep(userId: string, stepId: string) {
  const [step] = await db
    .delete(pomodoroTaskSteps)
    .where(ownLiveStep(userId, stepId))
    .returning({ id: pomodoroTaskSteps.id })
  if (!step) throw new Error("STEP_NOT_FOUND")
  return step
}

/**
 * Copies a task's steps onto the copy the rollover made of it, ticks and
 * all. A carried task is the same unfinished job, so 3 of 5 yesterday is 3 of
 * 5 today. Tyler's call on 7 Oct 2026.
 */
export async function copyTaskSteps(
  tx: Transaction,
  fromTaskId: string,
  toTaskId: string
) {
  await tx.execute(sql`
    insert into ${pomodoroTaskSteps} (task_id, user_id, title, done, sort_order)
    select ${toTaskId}, user_id, title, done, sort_order
    from ${pomodoroTaskSteps}
    where task_id = ${fromTaskId}
  `)
}
