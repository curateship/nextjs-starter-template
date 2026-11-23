import { eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, whoCanStillSee, type ProjectRow, type TaskRow } from "@/server/project/access"
import { taskRef, writeTaskNotices } from "@/server/project/notices"
import { projectTasks } from "@/server/project/schema"
import { recordTaskEvent } from "@/server/project/task-history"
import type { Actor } from "@/server/project/tasks"

/**
 * "Needs review": whoever handed a task out, or made it, can ask to check it
 * before it counts as finished. When it is marked Done the task stays Done,
 * shows "Waiting for review", and the reviewer gets "Ready for your review".
 * The reviewer presses Confirm, or Send back with a one-line reason, which
 * puts it back to Doing. Tyler's rule is four statuses, so this is a mark on
 * Done, never a fifth status, and a task waiting for review counts as Done in
 * progress bars and figures (Tyler's choice, 11 Oct 2026).
 */

/** Who may turn the switch on or off: whoever handed the task out, or made it. */
export function canAskForReview(task: Pick<TaskRow, "assignedByUserId" | "createdByUserId">, userId: string) {
  return task.assignedByUserId === userId || task.createdByUserId === userId
}

/** Who may Confirm or Send back: the reviewer, or whoever runs the team. */
export function canReview(task: Pick<TaskRow, "reviewerUserId">, role: TeamRole, userId: string) {
  return task.reviewerUserId === userId || runsTheTeam(role)
}

export async function setNeedsReview(
  actor: Actor,
  input: { taskId: string; on: boolean },
  database = db
) {
  const { task } = await requireTaskAccess(actor.id, input.taskId, database)
  if (!canAskForReview(task, actor.id)) throw new Error(PROJECT_ERRORS.cantAskForReview)
  await database
    .update(projectTasks)
    .set(
      input.on
        ? { needsReview: true, reviewerUserId: actor.id, updatedAt: now() }
        : // Turned off while waiting, the task simply stays Done. Turned on
          // for a task already Done, it waits for review the next time it
          // becomes Done, never for work already finished.
          { needsReview: false, reviewerUserId: null, reviewWaitingSince: null, updatedAt: now() }
    )
    .where(eq(projectTasks.id, task.id))
}

/**
 * When a task becomes Done: the reviewer to tell, or null when the task
 * confirms itself because nobody else is left to review it (no reviewer, the
 * reviewer marked it Done, or the reviewer can no longer see the project).
 */
export async function reviewerFor(
  project: ProjectRow,
  task: Pick<TaskRow, "needsReview" | "reviewerUserId">,
  actorId: string,
  database: Parameters<typeof whoCanStillSee>[2]
) {
  if (!task.needsReview || !task.reviewerUserId || task.reviewerUserId === actorId) return null
  const [reviewer] = await whoCanStillSee(project, [task.reviewerUserId], database)
  return reviewer ?? null
}

export async function reviewTask(
  actor: Actor,
  input: { taskId: string; action: "confirm" } | { taskId: string; action: "send_back"; reason: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (task.status !== "done" || !task.reviewWaitingSince) throw new Error(PROJECT_ERRORS.notWaitingForReview)
    if (!canReview(task, membership.role, actor.id)) {
      throw new Error(PROJECT_ERRORS.cantReview)
    }
    if (input.action === "confirm") {
      await tx
        .update(projectTasks)
        .set({ reviewWaitingSince: null, updatedAt: now() })
        .where(eq(projectTasks.id, task.id))
      await recordTaskEvent(tx, { taskId: task.id, kind: "review_confirmed", actorUserId: actor.id })
      return
    }
    await tx
      .update(projectTasks)
      .set({ status: "doing", completedAt: null, reviewWaitingSince: null, updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "sent_back",
      actorUserId: actor.id,
      targetUserId: task.assigneeUserId,
      reason: input.reason,
    })
    const [assignee] = await whoCanStillSee(project, [task.assigneeUserId], tx)
    if (assignee) {
      await writeTaskNotices(tx, [
        { kind: "task_sent_back", recipientUserId: assignee, actor, task: taskRef(task), extra: input.reason },
      ])
    }
  })
}
