import { createServerFn } from "@tanstack/react-start"
import { describeAuthError } from "./error-message"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  cleanAltText,
  cleanOriginalName,
  getMediaFileType,
  getOwnedMedia,
  listOwnedMedia,
  prepareMediaContent,
  serializeMedia,
  storedFilename,
  validateMediaFile,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
  type MediaSortBy,
  type MediaSortDirection,
} from "@/server/media/library"
import { deleteFromR2, R2StorageNotConfiguredError, uploadToR2 } from "@/server/media/storage"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { customShellMedia } from "@/server/schema"
import { now } from "@/server/auth/security"
import { userGet, userPost } from "@/server/guards"
import { uuid } from "@/server/auth/security"

export type { MediaFileType, MediaItem, MediaListResponse }
export type { MediaSortBy, MediaSortDirection }

const listMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
    fileType: z.enum(["image", "video"]).optional(),
    mimeType: z.enum(["image/svg+xml"]).optional(),
    sortBy: z.enum(["created_at", "original_name", "file_size", "file_type"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .optional()

const updateMediaSchema = z.object({
  mediaId: z.string().min(1),
  altText: z.string(),
})

export function getMediaErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("RATE_LIMITED")) {
    return "You've uploaded a lot just now. Please wait a few minutes and try again."
  }
  return describeAuthError(message) ?? (message || "Media request failed.")
}

const listMediaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listMediaSchema)
  .handler(async ({ data, context }) => {
    return listOwnedMedia({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 20,
      search: data?.search,
      fileType: data?.fileType,
      mimeType: data?.mimeType,
      sortBy: data?.sortBy,
      sortDirection: data?.sortDirection,
    })
  })

const uploadMediaFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data")
    }

    const file = data.get("file")
    if (!(file instanceof File)) {
      throw new Error("File is required")
    }

    return {
      file,
      altText: data.get("alt_text")?.toString(),
    }
  })
  .handler(async ({ data, context }) => {
    const mimeType = data.file.type || "application/octet-stream"
    validateMediaFile(mimeType, data.file.size)

    // Generous enough for a big drag-and-drop batch; only sustained hammering hits it.
    await enforceRateLimit(`media-upload:${context.user.id}`, {
      maxAttempts: 60,
      windowSeconds: 10 * 60,
    })

    const rawFileData = new Uint8Array(await data.file.arrayBuffer())
    if (!rawFileData.byteLength) {
      throw new Error("File is empty")
    }
    const fileData = prepareMediaContent(mimeType, rawFileData)

    const originalName = cleanOriginalName(data.file.name)
    const filename = storedFilename(originalName, mimeType)
    const storagePath = `${context.user.id}/${filename}`

    try {
      await uploadToR2(storagePath, fileData, mimeType)
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error(
          "R2 storage is not configured. Set the CUSTOM_SHELL_R2_* environment variables, including CUSTOM_SHELL_R2_PUBLIC_URL."
        )
      }
      throw new Error("Upload failed")
    }

    const createdAt = now()
    const row = {
      id: uuid(),
      userId: context.user.id,
      filename,
      originalName,
      altText: cleanAltText(data.altText),
      fileSize: fileData.byteLength,
      mimeType,
      fileType: getMediaFileType(mimeType),
      storagePath,
      createdAt,
      updatedAt: createdAt,
    }

    try {
      await db.insert(customShellMedia).values(row)
    } catch (error) {
      await deleteFromR2(storagePath).catch(() => undefined)
      throw error
    }

    return serializeMedia(row)
  })

const updateMediaFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateMediaSchema)
  .handler(async ({ data, context }): Promise<MediaItem> => {
    await getOwnedMedia(context.user.id, data.mediaId)

    const updatedAt = now()
    await db
      .update(customShellMedia)
      .set({ altText: cleanAltText(data.altText), updatedAt })
      .where(
        and(
          eq(customShellMedia.id, data.mediaId),
          eq(customShellMedia.userId, context.user.id)
        )
      )

    const row = await getOwnedMedia(context.user.id, data.mediaId)
    return serializeMedia(row)
  })

export function listMedia({
  page = 1,
  pageSize = 20,
  search,
  fileType,
  mimeType,
  sortBy,
  sortDirection,
}: {
  page?: number
  pageSize?: number
  search?: string
  fileType?: MediaFileType
  mimeType?: "image/svg+xml"
  sortBy?: MediaSortBy
  sortDirection?: MediaSortDirection
} = {}) {
  return listMediaFn({
    data: { page, pageSize, search, fileType, mimeType, sortBy, sortDirection },
  })
}

export function uploadMedia(file: File, altText?: string) {
  const formData = new FormData()
  formData.append("file", file)
  if (altText?.trim()) {
    formData.append("alt_text", altText.trim())
  }
  return uploadMediaFn({ data: formData })
}

export function updateMedia(mediaId: string, altText: string) {
  return updateMediaFn({ data: { mediaId, altText } })
}
