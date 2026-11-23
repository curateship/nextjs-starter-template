import { and, asc, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm"

import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import { MAX_TASK_TAGS, normalizeTagName } from "@/lib/pomodoro/task-tags"
import { db } from "@/server/db"
import { pomodoroTags, pomodoroTaskTags, tasks } from "@/server/pomodoro/schema"

/**
 * Tags on tasks. Names are stored in the one spelling `normalizeTagName`
 * gives, so "Admin" and "admin" are one tag. A tag belongs to one account, so every lookup is keyed on the
 * user id, and a task's tags can only be written by the task's owner.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * How far back a tag has to have been used to stay in the picker. A tag that
 * no task in that time carried leaves the picker but is never deleted, so
 * History can still filter by it and typing it again brings it back.
 */
const TAG_PICKER_DAYS = 30

/** Each task's tag names, in the order they were added. */
export function listTagsForTasks(taskIds: readonly string[]) {
  if (!taskIds.length) return Promise.resolve([])
  return db
    .select({ taskId: pomodoroTaskTags.taskId, name: pomodoroTags.name })
    .from(pomodoroTaskTags)
    .innerJoin(pomodoroTags, eq(pomodoroTags.id, pomodoroTaskTags.tagId))
    .where(inArray(pomodoroTaskTags.taskId, [...taskIds]))
    .orderBy(asc(pomodoroTaskTags.createdAt), asc(pomodoroTags.name))
}

/**
 * The tags the picker offers: those on any task planned in the last 30 days or
 * later. Ordered by name, capped so a picker never fetches without limit.
 */
export function listPickableTags(userId: string, today: string) {
  return db
    .selectDistinct({ name: pomodoroTags.name })
    .from(pomodoroTags)
    .innerJoin(pomodoroTaskTags, eq(pomodoroTaskTags.tagId, pomodoroTags.id))
    .innerJoin(tasks, eq(tasks.id, pomodoroTaskTags.taskId))
    .where(
      and(
        eq(pomodoroTags.userId, userId),
        gte(tasks.plannedDate, shiftLocalDate(today, -TAG_PICKER_DAYS))
      )
    )
    .orderBy(asc(pomodoroTags.name))
    .limit(100)
}

/** Every tag the account has ever made, for History's filter. */
export function listAllTags(userId: string) {
  return db
    .select({ id: pomodoroTags.id, name: pomodoroTags.name })
    .from(pomodoroTags)
    .where(eq(pomodoroTags.userId, userId))
    .orderBy(asc(pomodoroTags.name))
    .limit(200)
}

/**
 * Replaces a task's tags with these names, making any tag the account has not
 * used before. One request carries the whole set, so the row can never end up
 * with half of an edit. Refuses more than three with TOO_MANY_TAGS.
 */
export async function setTaskTags(
  userId: string,
  taskId: string,
  names: readonly string[]
) {
  const wanted = [...new Set(names.map(normalizeTagName).filter(Boolean))]
  if (wanted.length > MAX_TASK_TAGS) throw new Error("TOO_MANY_TAGS")
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
    if (!wanted.length) {
      await tx.delete(pomodoroTaskTags).where(eq(pomodoroTaskTags.taskId, taskId))
      return []
    }
    // A name the account already has hits the unique index and is left as
    // it is, so "admin" typed twice is still one tag.
    await tx
      .insert(pomodoroTags)
      .values(wanted.map((name) => ({ userId, name })))
      .onConflictDoNothing()
    const tagRows = await tx
      .select({ id: pomodoroTags.id })
      .from(pomodoroTags)
      .where(
        and(
          eq(pomodoroTags.userId, userId),
          inArray(sql`lower(${pomodoroTags.name})`, wanted)
        )
      )
    const tagIds = tagRows.map((row) => row.id)
    await tx
      .delete(pomodoroTaskTags)
      .where(
        and(
          eq(pomodoroTaskTags.taskId, taskId),
          notInArray(pomodoroTaskTags.tagId, tagIds)
        )
      )
    await tx
      .insert(pomodoroTaskTags)
      .values(tagIds.map((tagId) => ({ taskId, tagId })))
      .onConflictDoNothing()
    return wanted
  })
}

/** Gives a new task the same tags as another, inside the rollover. */
export async function copyTaskTags(
  tx: Transaction,
  fromTaskId: string,
  toTaskId: string
) {
  await tx.execute(sql`
    insert into ${pomodoroTaskTags} (task_id, tag_id)
    select ${toTaskId}, tag_id from ${pomodoroTaskTags}
    where task_id = ${fromTaskId}
    on conflict do nothing
  `)
}

/**
 * The most recent earlier copy a repeat rule made, so today's copy can wear
 * the tags yesterday's did. The rule keeps no tags of its own.
 */
export async function previousRepeatCopy(
  tx: Transaction,
  repeatId: string,
  before: string
) {
  const [row] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.repeatId, repeatId), lt(tasks.plannedDate, before)))
    .orderBy(desc(tasks.plannedDate))
    .limit(1)
  return row?.id ?? null
}
