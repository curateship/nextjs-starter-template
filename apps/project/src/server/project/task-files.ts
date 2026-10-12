import { and, asc, count, eq, isNotNull, isNull, sql, sum, type SQL } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { isShownPicture } from "@/lib/project/files"
import { LIMITS, runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { canChangeField, onlyWhoCanChange } from "@/lib/project/task-fields"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { cleanOriginalName } from "@/server/media/library"
import {
  deleteFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media/storage"
import {
  requireOpenProject,
  requireProjectAccess,
  requireTaskAccess,
  type Membership,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { projectTaskComments, projectTaskFiles, projectTaskTypeFields } from "@/server/project/schema"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Files on a task. The limits are Tyler's, 10 Oct 2026: 10 files of 10 MB
 * each per task, and 5 GB for the whole team.
 *
 * Files sit in the shell's storage bucket under a random name that never
 * leaves the server. People download them through Project's own address
 * (`src/routes/api/project/task-files.$fileId.ts`), which first checks they
 * can see the task, so someone who isn't on the project gets nothing.
 *
 * A file can also sit in a task type's File field (`fieldId`). It shares the
 * same storage, limits, download address and bin, and the Files card leaves
 * it out. Adding or deleting one also needs the right to change that field.
 *
 * A file sent in a chat message carries the message (`commentId`). In a
 * task's chat it is one of the task's files too, so it shows on the Files
 * card and counts toward the 10. In a project's chat it has no task: the
 * 10 MB and the team's 5 GB still hold, with no count (Tyler, 12 Oct 2026).
 * Messages are sent with their files in `task-chat.ts`.
 */

export type TaskFile = {
  id: string
  name: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; name: string } | null
  /** Drawn small in the Files card rather than listed by name. */
  picture: boolean
  canDelete: boolean
  /** The File field it sits in; null for the task's Files card. */
  fieldId: string | null
  /** The chat message it was sent in, if it was. */
  commentId: string | null
}

/** Where the bytes go. The tests hand in their own, so they never reach the bucket. */
export type FileStorage = {
  put: (path: string, data: Uint8Array, mimeType: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

export const bucket: FileStorage = {
  put: async (path, data, mimeType) => {
    await uploadToR2(path, data, mimeType)
  },
  remove: deleteFromR2,
}

const MIME_TYPE = /^[\w.+-]{1,60}\/[\w.+-]{1,60}$/

/** The type a browser said, when it is a sensible one; otherwise "some file". */
export function cleanMimeType(mimeType: string) {
  return MIME_TYPE.test(mimeType) ? mimeType : "application/octet-stream"
}

/** A new random place in the bucket. The name never leaves the server. */
export function newStoragePath(teamId: string) {
  return `project-task-files/${teamId}/${uuid()}`
}

/** The task's Files card: every file that isn't in a File field. */
export function listTaskFiles(
  viewer: { userId: string; role: TeamRole },
  taskId: string,
  archived: boolean,
  database: ProjectDb
): Promise<TaskFile[]> {
  return listFiles(viewer, and(eq(projectTaskFiles.taskId, taskId), isNull(projectTaskFiles.fieldId)), archived, database)
}

/** The files in the task's File fields, each with its field's id. */
export function listFieldFiles(
  viewer: { userId: string; role: TeamRole },
  taskId: string,
  archived: boolean,
  database: ProjectDb
): Promise<TaskFile[]> {
  return listFiles(viewer, and(eq(projectTaskFiles.taskId, taskId), isNotNull(projectTaskFiles.fieldId)), archived, database)
}

/** Files matching `where`, oldest first, as this viewer may use them. */
export async function listFiles(
  viewer: { userId: string; role: TeamRole },
  where: SQL | undefined,
  archived: boolean,
  database: ProjectDb
): Promise<TaskFile[]> {
  const rows = await database
    .select({ file: projectTaskFiles, uploaderName: customShellUsers.name })
    .from(projectTaskFiles)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskFiles.uploadedByUserId))
    .where(where)
    .orderBy(asc(projectTaskFiles.createdAt))
  return rows.map(({ file, uploaderName }) => ({
    id: file.id,
    name: file.originalName,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
    uploadedBy:
      file.uploadedByUserId && uploaderName !== null
        ? { id: file.uploadedByUserId, name: uploaderName }
        : null,
    picture: isShownPicture(file.mimeType),
    canDelete:
      !archived && (file.uploadedByUserId === viewer.userId || runsTheTeam(viewer.role)),
    fieldId: file.fieldId,
    commentId: file.commentId,
  }))
}

/**
 * A File field on the task's own type that this person may change. Its files
 * count toward the task's 10 and the team's 5 GB like any other.
 */
async function requireFileField(
  membership: Membership,
  task: TaskRow,
  fieldId: string,
  database: ProjectDb
) {
  const [field] = await database
    .select()
    .from(projectTaskTypeFields)
    .where(eq(projectTaskTypeFields.id, fieldId))
    .limit(1)
  if (!field || field.typeId !== task.typeId) throw new Error(PROJECT_ERRORS.fieldNotOnType)
  if (field.kind !== "file") throw new Error(PROJECT_ERRORS.notAFileField)
  if (!canChangeField(field, task, { userId: membership.userId, role: membership.role })) {
    throw new Error(onlyWhoCanChange(field) ?? PROJECT_ERRORS.fieldNotOnType)
  }
}

export async function addTaskFile(
  actor: Actor,
  input: {
    taskId: string
    name: string
    mimeType: string
    data: Uint8Array
    /** Into this File field rather than the Files card. */
    fieldId?: string | null
  },
  database = db,
  storage: FileStorage = bucket
): Promise<{ id: string }> {
  const { membership, project, task } = await requireTaskAccess(actor.id, input.taskId, database)
  if (input.fieldId) await requireFileField(membership, task, input.fieldId, database)
  const size = input.data.byteLength
  if (size === 0) throw new Error(PROJECT_ERRORS.fileEmpty)
  if (size > LIMITS.fileBytes) throw new Error(PROJECT_ERRORS.fileTooBig)
  // Checked before the upload so a full task or team never sends the bytes,
  // and again under the lock below so two uploads at once can't both fit.
  await requireRoom(project.teamId, task.id, size, database)

  const storagePath = newStoragePath(project.teamId)
  const mimeType = cleanMimeType(input.mimeType)
  try {
    await storage.put(storagePath, input.data, mimeType)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) throw new Error(PROJECT_ERRORS.fileStorageOff)
    throw new Error(PROJECT_ERRORS.fileNotSaved)
  }

  const id = uuid()
  try {
    await database.transaction(async (tx) => {
      await lockTeamFiles(project.teamId, tx)
      await requireRoom(project.teamId, task.id, size, tx)
      await tx.insert(projectTaskFiles).values({
        id,
        taskId: task.id,
        teamId: project.teamId,
        uploadedByUserId: actor.id,
        originalName: cleanOriginalName(input.name),
        mimeType,
        sizeBytes: size,
        storagePath,
        createdAt: now(),
        fieldId: input.fieldId ?? null,
      })
    })
  } catch (error) {
    await storage.remove(storagePath).catch(() => undefined)
    throw error
  }
  return { id }
}

/** Held until the transaction ends, so two uploads at once can't both take the last space. */
export async function lockTeamFiles(teamId: string, database: ProjectDb) {
  await database.execute(sql`select pg_advisory_xact_lock(hashtext(${`project-task-files:${teamId}`}))`)
}

/**
 * Room for `files` more files of `size` bytes in all: on the task, when there
 * is one, and in the team's 5 GB.
 */
export async function requireRoom(
  teamId: string,
  taskId: string | null,
  size: number,
  database: ProjectDb,
  files = 1
) {
  if (taskId) {
    const [onTask] = await database
      .select({ files: count() })
      .from(projectTaskFiles)
      .where(eq(projectTaskFiles.taskId, taskId))
    if (onTask.files + files > LIMITS.filesPerTask) throw new Error(PROJECT_ERRORS.tooManyFiles)
  }
  const [onTeam] = await database
    .select({ bytes: sum(projectTaskFiles.sizeBytes) })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.teamId, teamId))
  if (Number(onTeam.bytes ?? 0) + size > LIMITS.teamFileBytes) {
    throw new Error(PROJECT_ERRORS.teamFilesFull)
  }
}

/**
 * Removes the file from the bucket first and the row second, so a failed
 * removal leaves the file listed where it can be deleted again, rather than
 * a row gone and its bytes still stored.
 */
export async function deleteTaskFile(
  actor: Actor,
  fileId: string,
  database = db,
  storage: FileStorage = bucket
) {
  const file = await requireFile(fileId, database)
  const { membership, task } = await requireFileAccess(actor.id, file, database)
  if (file.uploadedByUserId !== actor.id && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.cantDeleteFile)
  }
  if (file.fieldId && task) await requireFileField(membership, task, file.fieldId, database)
  await removeStored([file.storagePath], storage)
  await database.delete(projectTaskFiles).where(eq(projectTaskFiles.id, file.id))
}

/** Before a task is deleted: its files leave the bucket, or the task stays. */
export async function removeTaskFilesFromStorage(
  taskId: string,
  database: ProjectDb,
  storage: FileStorage = bucket
) {
  const files = await database
    .select({ storagePath: projectTaskFiles.storagePath })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.taskId, taskId))
  await removeStored(
    files.map((file) => file.storagePath),
    storage
  )
}

/** Before a File field is deleted: its files leave the bucket, or the field stays. */
export async function removeFieldFilesFromStorage(
  fieldId: string,
  database: ProjectDb,
  storage: FileStorage = bucket
) {
  const files = await database
    .select({ storagePath: projectTaskFiles.storagePath })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.fieldId, fieldId))
  await removeStored(
    files.map((file) => file.storagePath),
    storage
  )
}

export async function removeStored(paths: string[], storage: FileStorage) {
  try {
    await Promise.all(paths.map((path) => storage.remove(path)))
  } catch {
    throw new Error(PROJECT_ERRORS.fileNotRemoved)
  }
}

/** The file to send, when this person can see its task. Null otherwise. */
export async function loadTaskFileForDownload(userId: string, fileId: string, database = db) {
  try {
    const file = await requireFile(fileId, database)
    await requireFileAccess(userId, file, database, { allowArchived: true })
    return {
      storagePath: file.storagePath,
      name: file.originalName,
      mimeType: file.mimeType,
    }
  } catch {
    return null
  }
}

type FileRow = typeof projectTaskFiles.$inferSelect

/**
 * The file's task, or the project chat it was sent in, when this person can
 * see it. Without `allowArchived` the project must be open, for changes.
 */
async function requireFileAccess(
  userId: string,
  file: FileRow,
  database: ProjectDb,
  { allowArchived = false } = {}
): Promise<{ membership: Membership; task: TaskRow | null }> {
  if (file.taskId) return requireTaskAccess(userId, file.taskId, database, { allowArchived })
  const [message] = file.commentId
    ? await database
        .select({ projectId: projectTaskComments.projectId })
        .from(projectTaskComments)
        .where(eq(projectTaskComments.id, file.commentId))
        .limit(1)
    : []
  if (!message?.projectId) throw new Error(PROJECT_ERRORS.fileNotFound)
  const access = await (allowArchived ? requireProjectAccess : requireOpenProject)(
    userId,
    message.projectId,
    database
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message === PROJECT_ERRORS.projectNotFound) {
      throw new Error(PROJECT_ERRORS.fileNotFound)
    }
    throw error
  })
  return { membership: access.membership, task: null }
}

async function requireFile(fileId: string, database: ProjectDb) {
  const [file] = await database
    .select()
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.id, fileId))
    .limit(1)
  if (!file) throw new Error(PROJECT_ERRORS.fileNotFound)
  return file
}
