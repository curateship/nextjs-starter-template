import { and, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm"

import { weekStartIn, type TaskClock } from "@/lib/project/clock"
import type { ProjectDb } from "@/server/project/access"
import { projectProjects, projectTaskClockRuns, projectTasks } from "@/server/project/schema"
import { recordTaskEvent } from "@/server/project/task-history"

/**
 * The task clock's rows: adding up a task's time and stopping a stretch.
 * Every change that takes a task away from its clock's person or out of
 * Doing pauses it here. Start, Pause and a total set by hand are in
 * `task-clock.ts`, and how it all works in `workspace/docs/task-clock.md`.
 */

/** Each task's clock: its finished stretches and fixes, and the stretch going now. */
export async function clocksFor(taskIds: readonly string[], database: ProjectDb) {
  const clocks = new Map<string, TaskClock>()
  if (taskIds.length === 0) return clocks
  const rows = await database
    .select({
      taskId: projectTaskClockRuns.taskId,
      seconds: sql<number>`coalesce(sum(${projectTaskClockRuns.seconds}), 0)::int`,
      runningSince: sql<Date | null>`max(${projectTaskClockRuns.startedAt}) filter (where ${projectTaskClockRuns.stoppedAt} is null)`,
    })
    .from(projectTaskClockRuns)
    .where(inArray(projectTaskClockRuns.taskId, [...taskIds]))
    .groupBy(projectTaskClockRuns.taskId)
  for (const row of rows) {
    clocks.set(row.taskId, {
      seconds: Number(row.seconds),
      // A raw `max(...)` comes back as text from some drivers, so it is read either way.
      runningSince: row.runningSince ? new Date(row.runningSince).toISOString() : null,
    })
  }
  return clocks
}

/**
 * Stops the task's running stretch at `at`, and writes "Paused the clock
 * after 45m" in its history. `actorId` is whoever's change paused it; a pause
 * nobody pressed, at midnight or as someone leaves, names the clock's own
 * person. Nothing happens when the clock isn't running. With `runId`, only
 * that stretch stops, so a job that found it a moment ago never stops a newer
 * one started since.
 */
export async function pauseTaskClock(
  database: ProjectDb,
  taskId: string,
  actorId: string | null,
  { at = new Date(), midnight = false, runId }: { at?: Date; midnight?: boolean; runId?: string } = {}
) {
  const [stopped] = await database
    .update(projectTaskClockRuns)
    .set({
      stoppedAt: at,
      seconds: sql`greatest(0, floor(extract(epoch from (${at.toISOString()}::timestamptz - ${projectTaskClockRuns.startedAt}))))::int`,
    })
    .where(
      and(
        eq(projectTaskClockRuns.taskId, taskId),
        isNull(projectTaskClockRuns.stoppedAt),
        runId ? eq(projectTaskClockRuns.id, runId) : undefined
      )
    )
    .returning({ userId: projectTaskClockRuns.userId, seconds: projectTaskClockRuns.seconds })
  if (!stopped) return null
  const by = actorId ?? stopped.userId
  if (by) {
    await recordTaskEvent(database, {
      taskId,
      kind: "clock_paused",
      actorUserId: by,
      reason: `${stopped.seconds ?? 0}${midnight ? " midnight" : ""}`,
    })
  }
  return { seconds: stopped.seconds ?? 0 }
}

/**
 * Pauses every clock this person has running, on the tasks `where` matches
 * (all of them when left out): at check-out, and when they come off a task's
 * project or the team.
 */
export async function pauseClocksOf(
  database: ProjectDb,
  userId: string,
  actorId: string | null,
  where?: SQL
) {
  const running = await database
    .select({ taskId: projectTaskClockRuns.taskId })
    .from(projectTaskClockRuns)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskClockRuns.taskId))
    .where(and(eq(projectTaskClockRuns.userId, userId), isNull(projectTaskClockRuns.stoppedAt), where))
  for (const run of running) await pauseTaskClock(database, run.taskId, actorId)
}

/**
 * Each person's clocked seconds since their week began, Monday at midnight in
 * their own zone, counting only tasks in projects `where` lets through. A
 * stretch that began before Monday counts from Monday, and one still running
 * counts up to `at`. A fix counts in the week it was made.
 */
export async function weekSecondsOf(
  people: readonly { id: string; zone: string }[],
  where: SQL | undefined,
  database: ProjectDb,
  at = new Date()
) {
  const totals = new Map(people.map((person) => [person.id, 0]))
  if (people.length === 0) return totals
  const starts = new Map(people.map((person) => [person.id, weekStartIn(at, person.zone).getTime()]))
  const earliest = new Date(Math.min(...starts.values()))
  const rows = await database
    .select({
      userId: projectTaskClockRuns.userId,
      kind: projectTaskClockRuns.kind,
      startedAt: projectTaskClockRuns.startedAt,
      stoppedAt: projectTaskClockRuns.stoppedAt,
      seconds: projectTaskClockRuns.seconds,
    })
    .from(projectTaskClockRuns)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskClockRuns.taskId))
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        inArray(projectTaskClockRuns.userId, people.map((person) => person.id)),
        or(isNull(projectTaskClockRuns.stoppedAt), gte(projectTaskClockRuns.stoppedAt, earliest)),
        isNull(projectTasks.deletedAt),
        where
      )
    )
  for (const row of rows) {
    const start = row.userId ? starts.get(row.userId) : undefined
    if (start === undefined || !row.userId) continue
    const seconds =
      row.kind === "fix"
        ? row.startedAt.getTime() >= start
          ? (row.seconds ?? 0)
          : 0
        : Math.max(0, Math.floor(((row.stoppedAt ?? at).getTime() - Math.max(row.startedAt.getTime(), start)) / 1000))
    totals.set(row.userId, (totals.get(row.userId) ?? 0) + seconds)
  }
  for (const [id, total] of totals) totals.set(id, Math.max(0, total))
  return totals
}
