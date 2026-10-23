import { eq, inArray } from "drizzle-orm"

import { dayLabel } from "@/lib/project/days"
import { dueMoveReason } from "@/lib/project/due-moves"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireTaskAccess,
  siteAdminIds,
  whoCanStillSee,
  type ProjectDb,
  type ProjectRow,
  type TaskRow,
} from "@/server/project/access"
import { taskRef, writeTaskNotices } from "@/server/project/notices"
import { projectTasks } from "@/server/project/schema"
import { recordTaskEvent } from "@/server/project/task-history"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Ask for more time (Seven features, part 2, Tyler, 20 Oct 2026). The person
 * doing a task asks for a later due date with a one-line reason. Whoever
 * handed it out answers: Yes moves the date there, No keeps it. When nobody
 * handed it out, or they made the task themselves, the site admin answers
 * (Tyler's pick). The site admin may always answer.
 *
 * Anyone on the project can still change the date directly; this is the
 * polite way for the person doing it, never a lock. One ask is open at a
 * time, on the task itself. A new ask replaces it, and it ends with its
 * answer, when the task is Done, handed to someone else, or put in the bin.
 */

type AskRow = Pick<
  TaskRow,
  | "status"
  | "deletedAt"
  | "assigneeUserId"
  | "assignedByUserId"
  | "dueDate"
  | "moreTimeDay"
  | "moreTimeReason"
  | "moreTimeByUserId"
>

/**
 * The open ask, or null. It only counts while the person who asked is still
 * the one doing the task, so a hand-over or the bin ends it without a write.
 * A due date already moved to the day asked for, or later, ends it too, so a
 * Yes can never pull the date back.
 */
export function openAsk(task: AskRow) {
  if (!task.moreTimeDay || !task.moreTimeByUserId) return null
  if (task.status === "done" || task.deletedAt || task.moreTimeByUserId !== task.assigneeUserId) return null
  if (task.dueDate && task.dueDate >= task.moreTimeDay) return null
  return { day: task.moreTimeDay, reason: task.moreTimeReason ?? "", byUserId: task.moreTimeByUserId }
}

/** Whoever handed the task out, when that is someone other than the person asking; else nobody. */
export function handedOutBy(task: Pick<TaskRow, "assignedByUserId" | "assigneeUserId">) {
  return task.assignedByUserId && task.assignedByUserId !== task.assigneeUserId ? task.assignedByUserId : null
}

/** May ask: the person assigned, on a task not Done with a due date to move. */
export function canAskForTime(task: Pick<TaskRow, "status" | "assigneeUserId" | "dueDate">, userId: string) {
  return task.assigneeUserId === userId && task.status !== "done" && Boolean(task.dueDate)
}

/** May answer: whoever handed it out, or the site admin (anyone who runs the team). */
function canAnswerTime(
  task: Pick<TaskRow, "assignedByUserId" | "assigneeUserId">,
  role: TeamRole,
  userId: string
) {
  return handedOutBy(task) === userId || runsTheTeam(role)
}

/** The open ask as the task's panel shows it, or null. */
export type MoreTimeAsk = {
  day: string
  reason: string
  askedByName: string
  /** Whoever answers it; null means the site admin. */
  answererName: string | null
  canAnswer: boolean
}

export async function loadMoreTimeAsk(
  task: TaskRow,
  viewer: { userId: string; role: TeamRole },
  database: ProjectDb
): Promise<MoreTimeAsk | null> {
  const ask = openAsk(task)
  if (!ask) return null
  const answerer = handedOutBy(task)
  const ids = [ask.byUserId, ...(answerer ? [answerer] : [])]
  const names = new Map(
    (
      await database
        .select({ id: customShellUsers.id, name: customShellUsers.name })
        .from(customShellUsers)
        .where(inArray(customShellUsers.id, ids))
    ).map((row) => [row.id, row.name])
  )
  return {
    day: ask.day,
    reason: ask.reason,
    askedByName: names.get(ask.byUserId) ?? "Someone",
    answererName: answerer ? (names.get(answerer) ?? null) : null,
    canAnswer: canAnswerTime(task, viewer.role, viewer.userId),
  }
}

/** Whoever hears about the ask: the person who handed it out while they can still see it, or the site admin. */
async function answerers(project: ProjectRow, task: TaskRow, database: ProjectDb) {
  const answerer = handedOutBy(task)
  const [stillThere] = answerer ? await whoCanStillSee(project, [answerer], database) : []
  return stillThere ? [stillThere] : siteAdminIds(database)
}

export async function askForMoreTime(
  actor: Actor,
  input: { taskId: string; day: string; reason: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.cantAskForTime)
    if (task.status === "done") throw new Error(PROJECT_ERRORS.askOnDoneTask)
    if (!task.dueDate) throw new Error(PROJECT_ERRORS.askNeedsDueDate)
    if (input.day <= task.dueDate) throw new Error(PROJECT_ERRORS.askForLaterDay)
    const at = now()
    await tx
      .update(projectTasks)
      .set({
        moreTimeDay: input.day,
        moreTimeReason: input.reason,
        moreTimeByUserId: actor.id,
        moreTimeAskedAt: at,
        updatedAt: at,
      })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "time_asked",
      actorUserId: actor.id,
      reason: `${input.day} ${input.reason}`,
    })
    await writeTaskNotices(
      tx,
      (await answerers(project, task, tx)).map((recipientUserId) => ({
        kind: "task_time_asked" as const,
        recipientUserId,
        actor,
        task: taskRef(task),
        extra: `${dayLabel(input.day)} instead of ${dayLabel(task.dueDate!)}. ${input.reason}`,
      }))
    )
  })
}

export async function answerMoreTime(
  actor: Actor,
  input: { taskId: string; answer: "yes" } | { taskId: string; answer: "no"; reason: string | null },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const ask = openAsk(task)
    if (!ask) throw new Error(PROJECT_ERRORS.noTimeAsked)
    if (!canAnswerTime(task, membership.role, actor.id)) throw new Error(PROJECT_ERRORS.cantAnswerTime)
    const closed = { moreTimeDay: null, moreTimeReason: null, moreTimeByUserId: null, moreTimeAskedAt: null }
    if (input.answer === "yes") {
      // A new day without a time is due all day, as any other date move.
      await tx
        .update(projectTasks)
        .set({ ...closed, dueDate: ask.day, dueAt: null, updatedAt: now() })
        .where(eq(projectTasks.id, task.id))
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "time_agreed",
        actorUserId: actor.id,
        targetUserId: ask.byUserId,
        reason: task.dueDate ? dueMoveReason(task.dueDate, ask.day) : null,
      })
    } else {
      await tx.update(projectTasks).set({ ...closed, updatedAt: now() }).where(eq(projectTasks.id, task.id))
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "time_kept",
        actorUserId: actor.id,
        targetUserId: ask.byUserId,
        reason: input.reason ? `${ask.day} ${input.reason}` : ask.day,
      })
    }
    const [asker] = await whoCanStillSee(project, [ask.byUserId], tx)
    if (!asker) return
    const kept = task.dueDate ? dayLabel(task.dueDate) : "the same day"
    await writeTaskNotices(tx, [
      {
        kind: "task_time_answered",
        recipientUserId: asker,
        actor,
        task: taskRef(task),
        extra:
          input.answer === "yes"
            ? `Yes, it's now due ${dayLabel(ask.day)}.`
            : `No, it stays due ${kept}.${input.reason ? ` ${input.reason}` : ""}`,
      },
    ])
  })
}
