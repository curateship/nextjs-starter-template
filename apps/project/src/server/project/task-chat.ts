import { and, asc, desc, eq, gt, gte, inArray, lt, or } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { linkedTaskIds, messageText, renameLinks, taggedUserIds } from "@/lib/project/mentions"
import {
  chatMentionHeading,
  chatReplyHeading,
  projectChatHref,
} from "@/lib/project/notices"
import { LIMITS, REACTIONS, runsTheTeam, type ChatPlace, type Reaction } from "@/lib/project/rules"
import { plural } from "@/lib/format/plural"
import { now, uuid } from "@/server/auth/security"
import { cleanOriginalName } from "@/server/media/library"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { db } from "@/server/db"
import {
  requireOpenProject,
  requireProjectAccess,
  requireTaskAccess,
  whoCanStillSee,
  type Membership,
  type ProjectDb,
  type ProjectRow,
  type TaskRow,
} from "@/server/project/access"
import {
  taskRef,
  writeAppNotices,
  writeTaskNotices,
  type AppNotice,
  type TaskNotice,
} from "@/server/project/notices"
import {
  projectCommentMentions,
  projectCommentReactions,
  projectProjectMembers,
  projectTaskComments,
  projectTaskFiles,
} from "@/server/project/schema"
import {
  bucket,
  cleanMimeType,
  listFiles,
  lockTeamFiles,
  newStoragePath,
  removeStored,
  requireRoom,
  type FileStorage,
  type TaskFile,
} from "@/server/project/task-files"
import { followerIds } from "@/server/project/task-followers"
import { recordTaskEvent } from "@/server/project/task-history"
import { linkName, openableLinks, requireLinkable, resolveTaskLinks } from "@/server/project/task-links"
import type { Actor, Person } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Chat: a task's, and each project's own. Both keep their messages in
 * `project_task_comments` and follow one set of rules. The rules, from
 * `workspace/docs/task-chat.md`:
 *
 * - Typing @ and a project member's name tags them. Tagging someone not on
 *   the project is refused. Typing # links a task the writer can see.
 * - In a task's chat, a tagged person gets "Anna asked you about a task", and
 *   everyone else told about the task's messages (the assignee, whoever
 *   handed it out, whoever made it, its followers and whoever the message
 *   replies to) gets "Anna commented on a task". Nobody is told twice about
 *   one message, and nobody about their own.
 * - In a project's chat, only tagged people are told, and whoever a message
 *   replies to (Tyler, 12 Oct 2026).
 * - The writer can edit a message. Editing tells only people newly tagged
 *   (Tyler, 10 Oct 2026). The writer, the owner and admins can delete one,
 *   which leaves "Message deleted" in its place, drops its reactions, and
 *   keeps or deletes its files as the person deleting chooses.
 * - Five fixed reactions, one of each per person per message, tell nobody.
 */

export type ChatReaction = {
  reaction: Reaction
  /** Who reacted, by name, earliest first. */
  people: string[]
  mine: boolean
}

/** The message a reply answers, as a short quote. */
export type ChatQuote = {
  id: string
  authorName: string
  /** The start of its words; empty once it is deleted. */
  words: string
  deleted: boolean
}

export type ChatMessage = {
  id: string
  /**
   * The words, with each tag as `@[Name](id)` and each task link as
   * `#[Title](id)`, the title already swapped for what this reader may see.
   * Empty once deleted.
   */
  body: string
  createdAt: string
  editedAt: string | null
  deleted: boolean
  author: Person | null
  canEdit: boolean
  canDelete: boolean
  replyTo: ChatQuote | null
  reactions: ChatReaction[]
  /** Files sent with it, which a deleted message keeps when asked to. */
  files: TaskFile[]
  /** Linked tasks this reader can open: task id to project id. */
  links: Record<string, string>
}

/** One page of a project's chat, oldest first. */
export type ProjectChat = {
  messages: ChatMessage[]
  /** Older messages wait behind "Show earlier messages". */
  earlier: boolean
  archived: boolean
}

/** A file arriving with a new message. */
export type NewFile = { name: string; mimeType: string; data: Uint8Array }

type CommentRow = typeof projectTaskComments.$inferSelect

type ChatAccess = { membership: Membership; project: ProjectRow; task: TaskRow | null }

/** The chat this person can read, or write in without `allowArchived`. */
async function requireChatAccess(
  userId: string,
  chat: ChatPlace,
  database: ProjectDb,
  { allowArchived = false } = {}
): Promise<ChatAccess> {
  if ("taskId" in chat) return requireTaskAccess(userId, chat.taskId, database, { allowArchived })
  const access = await (allowArchived ? requireProjectAccess : requireOpenProject)(
    userId,
    chat.projectId,
    database
  )
  return { ...access, task: null }
}

function chatOf(comment: CommentRow): ChatPlace {
  return comment.taskId ? { taskId: comment.taskId } : { projectId: comment.projectId ?? "" }
}

function sameChat(comment: CommentRow, chat: ChatPlace) {
  return "taskId" in chat ? comment.taskId === chat.taskId : comment.projectId === chat.projectId
}

const authorColumns = {
  comment: projectTaskComments,
  authorName: customShellUsers.name,
  authorAvatar: customShellUsers.avatarUrl,
}

/** A task's whole chat, oldest first. */
export async function loadTaskMessages(
  viewer: Membership,
  taskId: string,
  archived: boolean,
  database: ProjectDb
): Promise<ChatMessage[]> {
  const rows = await database
    .select(authorColumns)
    .from(projectTaskComments)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskComments.authorUserId))
    .where(eq(projectTaskComments.taskId, taskId))
    .orderBy(asc(projectTaskComments.createdAt), asc(projectTaskComments.id))
  return toMessages(viewer, rows, archived, database)
}

/** A message's place in a project's chat: its time, then its id. */
type ChatCursor = { at: string; id: string }

function olderThan(cursor: ChatCursor) {
  const at = new Date(cursor.at)
  return or(
    lt(projectTaskComments.createdAt, at),
    and(eq(projectTaskComments.createdAt, at), lt(projectTaskComments.id, cursor.id))
  )
}

/** The message at the cursor and every one after it. */
function fromOn(cursor: ChatCursor) {
  const at = new Date(cursor.at)
  return or(
    gt(projectTaskComments.createdAt, at),
    and(eq(projectTaskComments.createdAt, at), gte(projectTaskComments.id, cursor.id))
  )
}

/**
 * A project's chat: the newest page, or the page before `before`. With
 * `from`, every message from that one on, up to 500, so a page refreshing
 * after a change keeps every message it shows and gains the new ones.
 */
export async function loadProjectChat(
  userId: string,
  input: { projectId: string; before?: ChatCursor; from?: ChatCursor },
  database = db
): Promise<ProjectChat> {
  const page = input.from ? LIMITS.chatMostShown : LIMITS.chatPage
  const { membership, project } = await requireProjectAccess(userId, input.projectId, database)
  const inChat = eq(projectTaskComments.projectId, project.id)
  const rows = await database
    .select(authorColumns)
    .from(projectTaskComments)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskComments.authorUserId))
    .where(
      and(
        inChat,
        input.before ? olderThan(input.before) : undefined,
        input.from ? fromOn(input.from) : undefined
      )
    )
    .orderBy(desc(projectTaskComments.createdAt), desc(projectTaskComments.id))
    .limit(page + 1)
  const shown = rows.slice(0, page)
  let earlier = rows.length > page
  // `from` stops at a message, not at a page, so whether any sit before it
  // is a question of its own.
  const oldest = shown.at(-1)?.comment
  if (input.from && !earlier && oldest) {
    const [older] = await database
      .select({ id: projectTaskComments.id })
      .from(projectTaskComments)
      .where(and(inChat, olderThan({ at: oldest.createdAt.toISOString(), id: oldest.id })))
      .limit(1)
    earlier = Boolean(older)
  }
  const archived = Boolean(project.archivedAt)
  return {
    messages: await toMessages(membership, shown.reverse(), archived, database),
    earlier,
    archived,
  }
}

const QUOTE_LENGTH = 140

async function toMessages(
  viewer: Membership,
  rows: { comment: CommentRow; authorName: string | null; authorAvatar: string | null }[],
  archived: boolean,
  database: ProjectDb
): Promise<ChatMessage[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.comment.id)

  // The messages replied to, some of which may sit on an earlier page.
  const loaded = new Map(rows.map((row) => [row.comment.id, row]))
  const missing = [
    ...new Set(
      rows.flatMap((row) =>
        row.comment.replyToCommentId && !loaded.has(row.comment.replyToCommentId)
          ? [row.comment.replyToCommentId]
          : []
      )
    ),
  ]
  const quoted = missing.length
    ? await database
        .select(authorColumns)
        .from(projectTaskComments)
        .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskComments.authorUserId))
        .where(inArray(projectTaskComments.id, missing))
    : []
  for (const row of quoted) loaded.set(row.comment.id, row)

  const reactionRows = await database
    .select({
      commentId: projectCommentReactions.commentId,
      reaction: projectCommentReactions.reaction,
      userId: projectCommentReactions.userId,
      name: customShellUsers.name,
    })
    .from(projectCommentReactions)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectCommentReactions.userId))
    .where(inArray(projectCommentReactions.commentId, ids))
    .orderBy(asc(projectCommentReactions.createdAt))

  const files = await listFiles(viewer, inArray(projectTaskFiles.commentId, ids), archived, database)

  const links = await resolveTaskLinks(
    viewer,
    [...loaded.values()].flatMap((row) => (row.comment.deletedAt ? [] : linkedTaskIds(row.comment.body))),
    database
  )
  const forReader = (body: string) => renameLinks(body, (taskId) => linkName(links.get(taskId)))

  return rows.map(({ comment, authorName, authorAvatar }) => {
    const live = !comment.deletedAt && !archived
    const mine = comment.authorUserId === viewer.userId
    const body = comment.deletedAt ? "" : forReader(comment.body)
    const target = comment.replyToCommentId ? loaded.get(comment.replyToCommentId) : undefined
    const quoteWords = target && !target.comment.deletedAt ? messageText(forReader(target.comment.body)) : ""
    const messageFiles = files.filter((file) => file.commentId === comment.id)
    return {
      id: comment.id,
      body,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      deleted: Boolean(comment.deletedAt),
      author:
        comment.authorUserId && authorName !== null
          ? { id: comment.authorUserId, name: authorName, avatarUrl: authorAvatar ?? "" }
          : null,
      canEdit: live && mine,
      // A deleted message with files kept can still have them deleted.
      canDelete:
        !archived &&
        (live || messageFiles.length > 0) &&
        (mine || runsTheTeam(viewer.role)),
      replyTo: target
        ? {
            id: target.comment.id,
            authorName: target.authorName ?? "Former member",
            words: quoteWords.length > QUOTE_LENGTH ? `${quoteWords.slice(0, QUOTE_LENGTH - 1)}…` : quoteWords,
            deleted: Boolean(target.comment.deletedAt),
          }
        : null,
      reactions: REACTIONS.flatMap((reaction) => {
        const by = reactionRows.filter((row) => row.commentId === comment.id && row.reaction === reaction)
        return by.length
          ? [{ reaction, people: by.map((row) => row.name), mine: by.some((row) => row.userId === viewer.userId) }]
          : []
      }),
      files: messageFiles,
      links: body ? openableLinks(new Map(linkedTaskIds(body).map((id) => [id, links.get(id)!]))) : {},
    }
  })
}

/**
 * A new message, with up to 5 files. The files go up first, then the message
 * and the files' rows are saved together, so a refused message leaves no
 * file behind and a failed upload sends no message.
 */
export async function sendMessage(
  actor: Actor,
  input: { chat: ChatPlace; body: string; replyToId: string | null; files?: NewFile[] },
  database = db,
  storage: FileStorage = bucket
): Promise<{ id: string }> {
  const files = input.files ?? []
  if (!input.body && files.length === 0) throw new Error(PROJECT_ERRORS.messageEmpty)
  if (files.length > LIMITS.filesPerMessage) throw new Error(PROJECT_ERRORS.tooManyMessageFiles)
  for (const file of files) {
    if (file.data.byteLength === 0) throw new Error(PROJECT_ERRORS.fileEmpty)
    if (file.data.byteLength > LIMITS.fileBytes) throw new Error(PROJECT_ERRORS.fileTooBig)
  }
  const size = files.reduce((total, file) => total + file.data.byteLength, 0)

  const stored: { path: string; file: NewFile }[] = []
  if (files.length) {
    // Everything that could refuse the message is checked before any bytes
    // are sent, and again below once they are.
    const access = await requireChatAccess(actor.id, input.chat, database)
    await checkMessage(access, input, database)
    await requireRoom(access.project.teamId, access.task?.id ?? null, size, database, files.length)
    try {
      for (const file of files) {
        const path = newStoragePath(access.project.teamId)
        await storage.put(path, file.data, cleanMimeType(file.mimeType))
        stored.push({ path, file })
      }
    } catch (error) {
      await removeStored(stored.map((entry) => entry.path), storage).catch(() => undefined)
      if (error instanceof R2StorageNotConfiguredError) throw new Error(PROJECT_ERRORS.fileStorageOff)
      throw new Error(PROJECT_ERRORS.fileNotSaved)
    }
  }

  try {
    return await database.transaction(async (tx) => {
      const access = await requireChatAccess(actor.id, input.chat, tx)
      const { project, task } = access
      const { tagged, replyTo } = await checkMessage(access, input, tx)
      if (stored.length) {
        await lockTeamFiles(project.teamId, tx)
        await requireRoom(project.teamId, task?.id ?? null, size, tx, stored.length)
      }
      const id = uuid()
      const at = now()
      await tx.insert(projectTaskComments).values({
        id,
        taskId: task?.id ?? null,
        projectId: task ? null : project.id,
        replyToCommentId: replyTo?.id ?? null,
        authorUserId: actor.id,
        body: input.body,
        createdAt: at,
      })
      if (stored.length) {
        await tx.insert(projectTaskFiles).values(
          stored.map(({ path, file }) => ({
            id: uuid(),
            taskId: task?.id ?? null,
            commentId: id,
            teamId: project.teamId,
            uploadedByUserId: actor.id,
            originalName: cleanOriginalName(file.name),
            mimeType: cleanMimeType(file.mimeType),
            sizeBytes: file.data.byteLength,
            storagePath: path,
            createdAt: at,
          }))
        )
      }
      await saveTags(id, tagged, tx)

      const line = await noticeLine(access, input.body, stored.length, tx)
      const repliedTo = replyTo?.authorUserId ?? null
      if (task) {
        await recordTaskEvent(tx, { taskId: task.id, kind: "commented", actorUserId: actor.id })
        const told = new Set(await whoCanStillSee(project, tagged, tx))
        const others = await whoCanStillSee(
          project,
          [
            task.assigneeUserId,
            task.assignedByUserId,
            task.createdByUserId,
            repliedTo,
            ...(await followerIds(task.id, tx)),
          ],
          tx
        )
        await writeTaskNotices(tx, [
          ...taskNotices("task_mention", [...told], actor, task, line),
          ...taskNotices(
            "task_comment",
            others.filter((userId) => !told.has(userId)),
            actor,
            task,
            line
          ),
        ])
      } else {
        const told = await whoCanStillSee(project, tagged, tx)
        const answered = (await whoCanStillSee(project, [repliedTo], tx)).filter(
          (userId) => !told.includes(userId)
        )
        await writeAppNotices(tx, [
          ...chatNotices("mention", told, actor, project, line),
          ...chatNotices("reply", answered, actor, project, line),
        ])
      }
      return { id }
    })
  } catch (error) {
    await removeStored(stored.map((entry) => entry.path), storage).catch(() => undefined)
    throw error
  }
}

/** Who the message tags, the message it answers, and its links: each must be allowed. */
async function checkMessage(
  access: ChatAccess,
  input: { chat: ChatPlace; body: string; replyToId: string | null },
  database: ProjectDb
) {
  const tagged = await requireTaggable(access.project.id, input.body, database)
  await requireLinkable(access.membership, input.body, database)
  let replyTo: CommentRow | null = null
  if (input.replyToId) {
    const [row] = await database
      .select()
      .from(projectTaskComments)
      .where(eq(projectTaskComments.id, input.replyToId))
      .limit(1)
    if (!row || row.deletedAt || !sameChat(row, input.chat)) throw new Error(PROJECT_ERRORS.replyNotInChat)
    replyTo = row
  }
  return { tagged, replyTo }
}

export async function editComment(
  actor: Actor,
  input: { commentId: string; body: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { comment, ...access } = await requireLiveComment(actor.id, input.commentId, tx)
    const { project, task } = access
    if (comment.authorUserId !== actor.id) throw new Error(PROJECT_ERRORS.notYourMessage)
    if (comment.body === input.body) return
    if (!input.body && !(await hasFiles(comment.id, tx))) throw new Error(PROJECT_ERRORS.messageEmpty)
    const tagged = await requireTaggable(project.id, input.body, tx)
    await requireLinkable(access.membership, input.body, tx)
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
    const line = await noticeLine(access, input.body, 0, tx)
    if (task) await writeTaskNotices(tx, taskNotices("task_mention", newlyTagged, actor, task, line))
    else await writeAppNotices(tx, chatNotices("mention", newlyTagged, actor, project, line))
  })
}

/**
 * Leaves "Message deleted" in the message's place, without its words, tags or
 * reactions. Its files stay under it (and on the task) with `keepFiles`, and
 * are deleted from storage first otherwise, so a failed removal deletes
 * nothing. A message already deleted can still have its kept files deleted.
 */
export async function deleteComment(
  actor: Actor,
  input: { commentId: string; keepFiles: boolean },
  database = db,
  storage: FileStorage = bucket
) {
  const comment = await requireComment(input.commentId, database)
  const { membership } = await requireChatAccess(actor.id, chatOf(comment), database)
  if (comment.authorUserId !== actor.id && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.cantDeleteMessage)
  }
  const files = await database
    .select({ id: projectTaskFiles.id, storagePath: projectTaskFiles.storagePath })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.commentId, comment.id))
  if (comment.deletedAt && (input.keepFiles || files.length === 0)) {
    throw new Error(PROJECT_ERRORS.messageNotFound)
  }
  const dropping = input.keepFiles ? [] : files
  await removeStored(dropping.map((file) => file.storagePath), storage)
  await database.transaction(async (tx) => {
    if (dropping.length) {
      await tx.delete(projectTaskFiles).where(inArray(projectTaskFiles.id, dropping.map((file) => file.id)))
    }
    if (comment.deletedAt) return
    await tx
      .update(projectTaskComments)
      .set({ body: "", deletedAt: now() })
      .where(eq(projectTaskComments.id, comment.id))
    await tx.delete(projectCommentMentions).where(eq(projectCommentMentions.commentId, comment.id))
    await tx.delete(projectCommentReactions).where(eq(projectCommentReactions.commentId, comment.id))
  })
}

/** Puts a reaction on or takes it off. It tells nobody, which is the point of it. */
export async function reactToMessage(
  actor: Actor,
  input: { commentId: string; reaction: Reaction; on: boolean },
  database = db
) {
  const { comment } = await requireLiveComment(actor.id, input.commentId, database)
  if (input.on) {
    await database
      .insert(projectCommentReactions)
      .values({ commentId: comment.id, userId: actor.id, reaction: input.reaction, createdAt: now() })
      .onConflictDoNothing()
  } else {
    await database
      .delete(projectCommentReactions)
      .where(
        and(
          eq(projectCommentReactions.commentId, comment.id),
          eq(projectCommentReactions.userId, actor.id),
          eq(projectCommentReactions.reaction, input.reaction)
        )
      )
  }
}

async function requireComment(commentId: string, database: ProjectDb) {
  const [comment] = await database
    .select()
    .from(projectTaskComments)
    .where(eq(projectTaskComments.id, commentId))
    .limit(1)
  if (!comment) throw new Error(PROJECT_ERRORS.messageNotFound)
  return comment
}

/** The message and its chat, when this person may write there and it isn't deleted. */
async function requireLiveComment(userId: string, commentId: string, database: ProjectDb) {
  const comment = await requireComment(commentId, database)
  if (comment.deletedAt) throw new Error(PROJECT_ERRORS.messageNotFound)
  const access = await requireChatAccess(userId, chatOf(comment), database)
  return { ...access, comment }
}

async function hasFiles(commentId: string, database: ProjectDb) {
  const [file] = await database
    .select({ id: projectTaskFiles.id })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.commentId, commentId))
    .limit(1)
  return Boolean(file)
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

const NOTICE_LENGTH = 80

/**
 * The message's first words for a bell notice. Everyone told can see this
 * chat, but maybe not every linked task, so a link to a task in another
 * project reads "#a task" and only one in this project keeps its title.
 */
async function noticeLine(access: ChatAccess, body: string, fileCount: number, database: ProjectDb) {
  if (!body) return `Sent ${fileCount === 1 ? "a file" : `${fileCount} ${plural(fileCount, "file")}`}`
  const links = await resolveTaskLinks(access.membership, linkedTaskIds(body), database)
  const words = messageText(
    renameLinks(body, (taskId) => {
      const target = links.get(taskId)
      return target?.state === "open" && target.projectId === access.project.id ? target.title : "a task"
    })
  )
  return words.length > NOTICE_LENGTH ? `${words.slice(0, NOTICE_LENGTH - 1)}…` : words
}

function taskNotices(
  kind: "task_mention" | "task_comment",
  recipients: string[],
  actor: Actor,
  task: Pick<TaskRow, "id" | "projectId" | "title">,
  line: string
): TaskNotice[] {
  return recipients.map((recipientUserId) => ({
    kind,
    recipientUserId,
    actor,
    task: taskRef(task),
    extra: line,
  }))
}

function chatNotices(
  kind: "mention" | "reply",
  recipients: string[],
  actor: Actor,
  project: ProjectRow,
  line: string
): AppNotice[] {
  return recipients
    .filter((recipientUserId) => recipientUserId !== actor.id)
    .map((recipientUserId) => ({
      kind: kind === "mention" ? "chat_mention" : "chat_reply",
      recipientUserId,
      actorUserId: actor.id,
      message: kind === "mention" ? chatMentionHeading(actor.name) : chatReplyHeading(actor.name),
      detail: `${project.name}: ${line}`,
      href: projectChatHref(project.id),
    }))
}
