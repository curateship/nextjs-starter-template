import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
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
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { actorFor } from "@/server/video/project-guests"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * The two calls only the guest editor makes (`workspace/docs/project-guests.md`):
 * who the guest is, and uploading a file straight into their project. The
 * shell's own upload puts a file in the signed-in person's library, and a
 * guest has neither a session nor a library.
 */

/** What the guest editor page is told about the guest. */
export type ProjectGuestView = { name: string; expires_at: string }

const GUEST_ENDED = "GUEST_ENDED"

export function getProjectGuestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message === PROJECT_NOT_FOUND_MESSAGE || message.includes(GUEST_ENDED) || message.includes("AUTH_REQUIRED")) {
    return "Your time in this video has ended. Open the task in Project again."
  }
  return describeAuthError(message) ?? "That didn't work. Try again."
}

const loadGuestFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ProjectGuestView> => {
    const { guest } = await actorFor(context.caller, data.projectId)
    // Somebody signed in to Video opens the project in the admin editor instead.
    if (!guest) throw new Error(GUEST_ENDED)
    return { name: guest.personName, expires_at: guest.expiresAt.toISOString() }
  })

const uploadFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    const projectId = data.get("project_id")
    if (!(file instanceof File)) throw new Error("File is required")
    if (typeof projectId !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(projectId)) {
      throw new Error(PROJECT_NOT_FOUND_MESSAGE)
    }
    return { file, projectId }
  })
  .handler(async ({ data, context }) => {
    // The file goes in the project owner's library, as every file the project
    // uses does, and onto the project at once. Checked and stored the same way
    // as the shell's own upload (`src/lib/api/media/media.ts`).
    const { userId } = await actorFor(context.caller, data.projectId)
    const mimeType = data.file.type || "application/octet-stream"
    validateMediaFile(mimeType, data.file.size)
    await enforceRateLimit(`media-upload:${userId}`, { maxAttempts: 60, windowSeconds: 10 * 60 })

    const rawFileData = new Uint8Array(await data.file.arrayBuffer())
    if (!rawFileData.byteLength) throw new Error("File is empty")
    const fileData = prepareMediaContent(mimeType, rawFileData)
    const originalName = cleanOriginalName(data.file.name)
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
    await attachMediaToScope(userId, { type: "project", id: data.projectId }, row.id)
    return serializeMedia(row)
  })

/** The guest behind this browser for the project, or a refusal once they have none. */
export function loadProjectGuest(projectId: string) {
  return loadGuestFn({ data: { projectId } })
}

/** Uploads a file into the project's media, for the guest editor. */
export function uploadProjectMedia(projectId: string, file: File) {
  const form = new FormData()
  form.set("file", file)
  form.set("project_id", projectId)
  return uploadFn({ data: form })
}
