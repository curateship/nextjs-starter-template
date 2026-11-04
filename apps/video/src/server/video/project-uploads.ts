import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  cleanOriginalName,
  getMediaFileType,
  prepareMediaContent,
  serializeMedia,
  storedFilename,
  validateMediaFile,
} from "@/server/media/library"
import { deleteFromR2, getPublicMediaUrl, R2StorageNotConfiguredError, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { attachMediaToScope } from "@/server/video/media-list"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * One file sent in one request straight into a video project: into the
 * owner's media library, as every file a project uses is, and onto the
 * project at once. Used by a guest sent from Project
 * (workspace/docs/project-guests.md) and by a phone sending pictures
 * (workspace/docs/phone-uploads.md), neither of which has the owner's
 * session. Checked and stored the same way as the shell's own upload
 * (`src/lib/api/media/media.ts`). The caller has already checked who may
 * add to the project.
 */
export async function storeProjectFile(userId: string, projectId: string, file: File) {
  const mimeType = file.type || "application/octet-stream"
  validateMediaFile(mimeType, file.size)
  await enforceRateLimit(`media-upload:${userId}`, { maxAttempts: 60, windowSeconds: 10 * 60 })

  const rawFileData = new Uint8Array(await file.arrayBuffer())
  if (!rawFileData.byteLength) throw new Error("File is empty")
  const fileData = prepareMediaContent(mimeType, rawFileData)
  const originalName = cleanOriginalName(file.name)
  const filename = storedFilename(originalName, mimeType)
  const storagePath = `${userId}/${filename}`
  try {
    await getPublicMediaUrl(storagePath)
    await uploadToR2(storagePath, fileData, mimeType)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) {
      throw new Error("File storage is not set up, so files can't be added yet.")
    }
    throw new Error("Upload failed")
  }

  const createdAt = now()
  const row = {
    id: uuid(),
    workspaceId: await workspaceIdForRequest(userId),
    userId,
    filename,
    originalName,
    altText: null,
    fileSize: fileData.byteLength,
    mimeType,
    fileType: getMediaFileType(mimeType),
    storagePath,
    emailProtectedAt: null,
    createdAt,
    updatedAt: createdAt,
  }
  try {
    await db.insert(customShellMedia).values(row)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  await attachMediaToScope(userId, { type: "project", id: projectId }, row.id)
  return serializeMedia(row)
}
