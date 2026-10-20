import { and, eq, isNull, sql } from "drizzle-orm"

import { clockPausedHeading, taskHref } from "@/lib/project/notices"
import { clockTotal } from "@/lib/project/clock"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { writeAppNotices } from "@/server/project/notices"
import { projectProjects, projectTaskClockRuns, projectTasks } from "@/server/project/schema"
import { clocksFor, pauseTaskClock } from "@/server/project/task-clock-runs"
import { recordTaskEvent } from "@/server/project/task-history"
import { acceptTask, assignTask, setTaskStatus, type Actor } from "@/server/project/tasks"

/**
 * The task panel's clock (Tyler, 20 Oct 2026): Start, Pause, and a
 * total set by hand. Only the person the task is assigned to and the site
 * admin run it, and it always counts for the person assigned. How it works
 * is in `workspace/docs/task-clock.md`.
 */

/** Who may run the clock: the person assigned, or the site admin. */
async function requireClockAccess(actor: Actor, taskId: string, tx: ProjectDb) {
  const access = await requireTaskAccess(actor.id, taskId, tx)
  if (access.task.assigneeUserId !== actor.id && !access.membership.siteAdmin) {
    throw new Error(PROJECT_ERRORS.clockNotYours)
  }
  return access
}

/**
 * Start, and Start again on a Done task. The task moves to Doing, and
 * the clock carries on from its total. A task nobody has becomes the
 * starter's, and one handed to them and not yet accepted is accepted. A clock
 * the same person has running on another task pauses first, and its title
 * comes back so the screen can say so.
 */
export async function startClock(
  actor: Actor,
  taskId: string,
  database: ProjectDb = db,
  at = new Date()
): Promise<{ pausedTitle: string | null }> {
  return database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, taskId, tx)
    let assigneeId = task.assigneeUserId
    if (!assigneeId) {
      await assignTask(actor, { taskId, assigneeUserId: actor.id }, tx)
      await recordTaskEvent(tx, { taskId, kind: "took", actorUserId: actor.id })
      assigneeId = actor.id
    } else if (assigneeId !== actor.id && !membership.siteAdmin) {
      throw new Error(PROJECT_ERRORS.clockNotYours)
    } else if (assigneeId === actor.id && !task.acceptedAt) {
      // Starting the work is taking it on.
      await acceptTask(actor, taskId, tx)
    }
    if (task.status !== "doing") {
      await setTaskStatus(actor, { taskId, status: "doing", stuckReason: null }, tx)
    }

    const [running] = await tx
      .select({ id: projectTaskClockRuns.id })
      .from(projectTaskClockRuns)
      .where(and(eq(projectTaskClockRuns.taskId, taskId), isNull(projectTaskClockRuns.stoppedAt)))
      .limit(1)
    if (running) return { pausedTitle: null }

    // One clock at a time for each person.
    const [other] = await tx
      .select({ taskId: projectTaskClockRuns.taskId, title: projectTasks.title })
      .from(projectTaskClockRuns)
      .innerJoin(projectTasks, eq(projectTasks.id, projectTaskClockRuns.taskId))
      .where(and(eq(projectTaskClockRuns.userId, assigneeId), isNull(projectTaskClockRuns.stoppedAt)))
      .limit(1)
    if (other) await pauseTaskClock(tx, other.taskId, actor.id, { at })

    await tx.insert(projectTaskClockRuns).values({
      id: uuid(),
      taskId,
      userId: assigneeId,
      kind: "run",
      startedAt: at,
    })
    await recordTaskEvent(tx, { taskId, kind: "clock_started", actorUserId: actor.id })
    return { pausedTitle: other?.title ?? null }
  })
}

/** Pause. The stretch so far is added to the task's total. */
export async function pauseClock(actor: Actor, taskId: string, database: ProjectDb = db, at = new Date()) {
  await database.transaction(async (tx) => {
    await requireClockAccess(actor, taskId, tx)
    await pauseTaskClock(tx, taskId, actor.id, { at })
  })
}

/**
 * Sets the task's time by hand, for a clock left running by mistake. A
 * running clock pauses first. The difference is saved as a row of its own,
 * counted for the person assigned, and the history keeps the old and new
 * totals, so nobody can quietly change anyone's hours.
 */
export async function setClockTotal(
  actor: Actor,
  input: { taskId: string; seconds: number },
  database: ProjectDb = db,
  at = new Date()
) {
  await database.transaction(async (tx) => {
    const { task } = await requireClockAccess(actor, input.taskId, tx)
    await pauseTaskClock(tx, task.id, actor.id, { at })
    const before = (await clocksFor([task.id], tx)).get(task.id)?.seconds ?? 0
    if (before === input.seconds) return
    await tx.insert(projectTaskClockRuns).values({
      id: uuid(),
      taskId: task.id,
      userId: task.assigneeUserId ?? actor.id,
      kind: "fix",
      startedAt: at,
      stoppedAt: at,
      seconds: input.seconds - before,
    })
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "clock_fixed",
      actorUserId: actor.id,
      reason: `${before} ${input.seconds}`,
    })
  })
}

type MidnightRow = { runId: string; taskId: string; userId: string | null; midnight: Date | string }

/**
 * A clock still running when midnight comes in its person's own time zone
 * (the team's when they haven't set one) pauses at that midnight, so a
 * clock left on overnight counts nothing after it. The person finds a bell
 * notice in the morning naming the task and its total. On the shell's
 * fifteen-second loop with the planning jobs; each pass takes what has
 * crossed a midnight since the last.
 */
export async function pauseClocksAtMidnight(database: CustomShellDb = db, at = new Date()) {
  const found = await database.execute(sql`
    SELECT r.id AS "runId", r.task_id AS "taskId", r.user_id AS "userId",
      (((r.started_at AT TIME ZONE z.zone)::date + 1)::timestamp AT TIME ZONE z.zone) AS "midnight"
    FROM project_task_clock_runs r
    JOIN project_tasks t ON t.id = r.task_id
    JOIN project_projects p ON p.id = t.project_id
    JOIN project_teams tm ON tm.id = p.team_id
    LEFT JOIN project_team_members m ON m.team_id = p.team_id AND m.user_id = r.user_id
    CROSS JOIN LATERAL (SELECT coalesce(m.time_zone, tm.time_zone) AS zone) z
    WHERE r.stopped_at IS NULL
      AND z.zone IN (SELECT name FROM pg_timezone_names)
      AND (r.started_at AT TIME ZONE z.zone)::date < (${at.toISOString()}::timestamptz AT TIME ZONE z.zone)::date
    LIMIT 200
  `)
  for (const row of found.rows as MidnightRow[]) {
    await database.transaction(async (tx) => {
      const paused = await pauseTaskClock(tx, row.taskId, null, {
        at: new Date(row.midnight),
        midnight: true,
        runId: row.runId,
      })
      if (!paused || !row.userId) return
      const [target] = await tx
        .select({ title: projectTasks.title, projectId: projectTasks.projectId, projectName: projectProjects.name })
        .from(projectTasks)
        .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
        .where(eq(projectTasks.id, row.taskId))
      if (!target) return
      const total = (await clocksFor([row.taskId], tx)).get(row.taskId)?.seconds ?? 0
      await writeAppNotices(tx, [
        {
          kind: "clock_paused",
          recipientUserId: row.userId,
          message: clockPausedHeading(target.title),
          detail: `${target.projectName} · ${clockTotal(total)} in all`,
          href: taskHref(target.projectId, row.taskId),
        },
      ])
    })
  }
}
