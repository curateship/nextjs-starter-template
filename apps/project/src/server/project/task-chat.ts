import { and, asc, eq, inArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { messageText, taggedUserIds } from "@/lib/project/mentions"
import { runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireTaskAccess,
  whoCanStillSee,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { taskRef, writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import {
  projectCommentMentions,
  projectProjectMembers,
  projectTaskComments,
} from "@/server/project/schema"
import { followerIds } from "@/server/project/task-followers"
import { recordTaskEvent } from "@/server/project/task-history"
import type { Actor, Person } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * A task's chat. The rules, from `workspace/docs/task-chat.md`:
 *
 * - Typing @ and a project member's name tags them, and they get "Anna asked
 *   you about a task". Tagging someone not on the project is refused.
 * - Everyone else told about a task's messages (the assignee, whoever handed
 *   it out, whoever made it, and its followers) gets "Anna commented on a
 *   task". Nobody is told twice about one message, and nobody about their own.
 * - The writer can edit a message. Editing tells only people newly tagged
 *   (Tyler, 10 Oct 2026). The writer, the owner and admins can delete one,
 *   which leaves "Message deleted" in its place.
 */

export type TaskComment = {
  id: string
  /** The words, with each tag as `@[Name](id)`. Empty once deleted. */
  body: string
  createdAt: string
  editedAt: string | null
  deleted: boolean
  author: Person | null
  canEdit: boolean
  canDelete: boolean
}

export async function loadTaskComments(
  viewer: { userId: string; role: TeamRole },
  taskId: string,
  archived: boolean,
  database: ProjectDb
): Promise<TaskComment[]> {
  const rows = await database
    .select({
      comment: projectTaskComments,
      authorName: customShellUsers.name,
      authorAvatar: customShellUsers.avatarUrl,
    })
    .from(projectTaskComments)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskComments.authorUserId))
    .where(eq(projectTaskComments.taskId, taskId))
    .orderBy(asc(projectTaskComments.createdAt))
  return rows.map(({ comment, authorName, authorAvatar }) => {
    const live = !comment.deletedAt && !archived
    const mine = comment.authorUserId === viewer.userId
    return {
      id: comment.id,
      body: comment.deletedAt ? "" : comment.body,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      deleted: Boolean(comment.deletedAt),
      author:
        comment.authorUserId && authorName !== null
          ? { id: comment.authorUserId, name: authorName, avatarUrl: authorAvatar ?? "" }
          : null,
      canEdit: live && mine,
      canDelete: live && (mine || runsTheTeam(viewer.role)),
    }
  })
}

export async function addComment(
  actor: Actor,
  input: { taskId: string; body: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const { project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const tagged = await requireTaggable(project.id, input.body, tx)
    const id = uuid()
    await tx.insert(projectTaskComments).values({
      id,
      taskId: task.id,
      authorUserId: actor.id,
      body: input.body,
      createdAt: now(),
    })
    await saveTags(id, tagged, tx)
    await recordTaskEvent(tx, { taskId: task.id, kind: "commented", actorUserId: actor.id })

    const told = new Set(await whoCanStillSee(project, tagged, tx))
    const others = await whoCanStillSee(
      project,
      [
        task.assigneeUserId,
        task.assignedByUserId,
        task.createdByUserId,
        ...(await followerIds(task.id, tx)),
      ],
      tx
    )
    await writeTaskNotices(tx, [
      ...messageNotices("task_mention", [...told], actor, task, input.body),
      ...messageNotices(
        "task_comment",
        others.filter((userId) => !told.has(userId)),
        actor,
        task,
        input.body
      ),
    ])
    return { id }
  })
}

export async function editComment(
  actor: Actor,
  input: { commentId: string; body: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { comment, project, task } = await requireLiveComment(actor.id, input.commentId, tx)
    if (comment.authorUserId !== actor.id) throw new Error(PROJECT_ERRORS.notYourMessage)
    if (comment.body === input.body) return
    const tagged = await requireTaggable(project.id, input.body, tx)
    const before = await tx
      .select({ userId: projectCommentMentions.userId })
      .from(projectCommentMentions)
      .where(eq(projectCommentMentions.commentId, comment.id))
    await tx
      .update(projectTaskComments)
      .set({ body: input.body, editedAt: now() })
      .where(eq(projectTaskComments.id, comment.id))
    await tx.delete(projectCommentMentions).where(eq(projectCommentMentions.commentId, comment.id))
    await saveTags(comment.id, tagged, tx)

    const taggedBefore = new Set(before.map((row) => row.userId))
    const newlyTagged = await whoCanStillSee(
      project,
      tagged.filter((userId) => !taggedBefore.has(userId)),
      tx
    )
    await writeTaskNotices(tx, messageNotices("task_mention", newlyTagged, actor, task, input.body))
  })
}

export async function deleteComment(actor: Actor, commentId: string, database = db) {
  await database.transaction(async (tx) => {
    const { comment, membership } = await requireLiveComment(actor.id, commentId, tx)
    if (comment.authorUserId !== actor.id && !runsTheTeam(membership.role)) {
      throw new Error(PROJECT_ERRORS.cantDeleteMessage)
    }
    await tx
      .update(projectTaskComments)
      .set({ body: "", deletedAt: now() })
      .where(eq(projectTaskComments.id, comment.id))
    await tx.delete(projectCommentMentions).where(eq(projectCommentMentions.commentId, comment.id))
  })
}

/** The message and its task, when this person may change the task and it isn't deleted. */
async function requireLiveComment(userId: string, commentId: string, database: ProjectDb) {
  const [comment] = await database
    .select()
    .from(projectTaskComments)
    .where(eq(projectTaskComments.id, commentId))
    .limit(1)
  if (!comment || comment.deletedAt) throw new Error(PROJECT_ERRORS.messageNotFound)
  const access = await requireTaskAccess(userId, comment.taskId, database)
  return { ...access, comment }
}

/** Everyone the words tag, refusing the lot if one of them isn't on the project. */
async function requireTaggable(projectId: string, body: string, database: ProjectDb) {
  const ids = taggedUserIds(body)
  if (ids.length === 0) return []
  const members = await database
    .select({ userId: projectProjectMembers.userId })
    .from(projectProjectMembers)
    .where(
      and(eq(projectProjectMembers.projectId, projectId), inArray(projectProjectMembers.userId, ids))
    )
  if (members.length !== ids.length) throw new Error(PROJECT_ERRORS.tagNotOnProject)
  return ids
}

async function saveTags(commentId: string, userIds: string[], database: ProjectDb) {
  if (userIds.length === 0) return
  await database
    .insert(projectCommentMentions)
    .values(userIds.map((userId) => ({ commentId, userId })))
}

function messageNotices(
  kind: "task_mention" | "task_comment",
  recipients: string[],
  actor: Actor,
  task: Pick<TaskRow, "id" | "projectId" | "title">,
  body: string
): TaskNotice[] {
  const words = messageText(body)
  const line = words.length > 80 ? `${words.slice(0, 79)}…` : words
  return recipients.map((recipientUserId) => ({
    kind,
    recipientUserId,
    actor,
    task: taskRef(task),
    extra: line,
  }))
}
