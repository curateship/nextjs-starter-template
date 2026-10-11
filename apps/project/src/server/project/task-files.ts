import { asc, count, eq, sql, sum } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { isShownPicture } from "@/lib/project/files"
import { LIMITS, runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { cleanOriginalName } from "@/server/media/library"
import {
  deleteFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media/storage"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { projectTaskFiles } from "@/server/project/schema"
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
}

/** Where the bytes go. The tests hand in their own, so they never reach the bucket. */
export type FileStorage = {
  put: (path: string, data: Uint8Array, mimeType: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

const bucket: FileStorage = {
  put: async (path, data, mimeType) => {
    await uploadToR2(path, data, mimeType)
  },
  remove: deleteFromR2,
}

const MIME_TYPE = /^[\w.+-]{1,60}\/[\w.+-]{1,60}$/

export async function listTaskFiles(
  viewer: { userId: string; role: TeamRole },
  taskId: string,
  archived: boolean,
  database: ProjectDb
): Promise<TaskFile[]> {
  const rows = await database
    .select({ file: projectTaskFiles, uploaderName: customShellUsers.name })
    .from(projectTaskFiles)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskFiles.uploadedByUserId))
    .where(eq(projectTaskFiles.taskId, taskId))
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
  }))
}

export async function addTaskFile(
  actor: Actor,
  input: { taskId: string; name: string; mimeType: string; data: Uint8Array },
  database = db,
  storage: FileStorage = bucket
): Promise<{ id: string }> {
  const { project, task } = await requireTaskAccess(actor.id, input.taskId, database)
  const size = input.data.byteLength
  if (size === 0) throw new Error(PROJECT_ERRORS.fileEmpty)
  if (size > LIMITS.fileBytes) throw new Error(PROJECT_ERRORS.fileTooBig)
  // Checked before the upload so a full task or team never sends the bytes,
  // and again under the lock below so two uploads at once can't both fit.
  await requireRoom(project.teamId, task.id, size, database)

  const storagePath = `project-task-files/${project.teamId}/${uuid()}`
  const mimeType = MIME_TYPE.test(input.mimeType) ? input.mimeType : "application/octet-stream"
  try {
    await storage.put(storagePath, input.data, mimeType)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) throw new Error(PROJECT_ERRORS.fileStorageOff)
    throw new Error(PROJECT_ERRORS.fileNotSaved)
  }

  const id = uuid()
  try {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`project-task-files:${project.teamId}`}))`
      )
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
      })
    })
  } catch (error) {
    await storage.remove(storagePath).catch(() => undefined)
    throw error
  }
  return { id }
}

async function requireRoom(teamId: string, taskId: string, size: number, database: ProjectDb) {
  const [onTask] = await database
    .select({ files: count() })
    .from(projectTaskFiles)
    .where(eq(projectTaskFiles.taskId, taskId))
  if (onTask.files >= LIMITS.filesPerTask) throw new Error(PROJECT_ERRORS.tooManyFiles)
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
  const { membership } = await requireTaskAccess(actor.id, file.taskId, database)
  if (file.uploadedByUserId !== actor.id && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.cantDeleteFile)
  }
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

async function removeStored(paths: string[], storage: FileStorage) {
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
    await requireTaskAccess(userId, file.taskId, database, { allowArchived: true })
    return {
      storagePath: file.storagePath,
      name: file.originalName,
      mimeType: file.mimeType,
    }
  } catch {
    return null
  }
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
