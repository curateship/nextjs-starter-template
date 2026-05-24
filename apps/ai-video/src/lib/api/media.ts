import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
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
} from "@/server/media"
import { deleteFromR2, R2StorageNotConfiguredError, uploadToR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoMedia } from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"
import { uuid } from "@/server/security"

export type { MediaFileType, MediaItem, MediaListResponse }
export type { MediaSortBy, MediaSortDirection }

const listMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    fileType: z.enum(["image", "video"]).optional(),
    sortBy: z.enum(["created_at", "original_name", "file_size", "file_type"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .optional()

const mediaIdSchema = z.object({ mediaId: z.string().min(1) })

const updateMediaSchema = z.object({
  mediaId: z.string().min(1),
  altText: z.string(),
})

const bulkDeleteMediaSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(100),
})

export function getMediaErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Media request failed."
}

const listMediaFn = createServerFn({ method: "GET" })
  .inputValidator(listMediaSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return listOwnedMedia({
      userId: user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 20,
      fileType: data?.fileType,
      sortBy: data?.sortBy,
      sortDirection: data?.sortDirection,
    })
  })

const uploadMediaFn = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const mimeType = data.file.type || "application/octet-stream"
    validateMediaFile(mimeType, data.file.size)

    const rawFileData = new Uint8Array(await data.file.arrayBuffer())
    if (!rawFileData.byteLength) {
      throw new Error("File is empty")
    }
    const fileData = prepareMediaContent(mimeType, rawFileData)

    const originalName = cleanOriginalName(data.file.name)
    const filename = storedFilename(originalName, mimeType)
    const storagePath = `${user.id}/${filename}`

    try {
      await uploadToR2(storagePath, fileData, mimeType)
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error(
          "R2 storage is not configured. Set the AI_VIDEO_R2_* environment variables, including AI_VIDEO_R2_PUBLIC_URL."
        )
      }
      throw new Error("Upload failed")
    }

    const createdAt = now()
    const row = {
      id: uuid(),
      userId: user.id,
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
      await db.insert(aiVideoMedia).values(row)
    } catch (error) {
      await deleteFromR2(storagePath).catch(() => undefined)
      throw error
    }

    return serializeMedia(row)
  })

const updateMediaFn = createServerFn({ method: "POST" })
  .inputValidator(updateMediaSchema)
  .handler(async ({ data }): Promise<MediaItem> => {
    requireAppOrigin()
    const user = await requireUser()
    await getOwnedMedia(user.id, data.mediaId)

    const updatedAt = now()
    await db
      .update(aiVideoMedia)
      .set({ altText: cleanAltText(data.altText), updatedAt })
      .where(
        and(
          eq(aiVideoMedia.id, data.mediaId),
          eq(aiVideoMedia.userId, user.id)
        )
      )

    const row = await getOwnedMedia(user.id, data.mediaId)
    return serializeMedia(row)
  })

const deleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator(mediaIdSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const row = await getOwnedMedia(user.id, data.mediaId)
    await deleteFromR2(row.storagePath)
    await db
      .delete(aiVideoMedia)
      .where(
        and(
          eq(aiVideoMedia.id, data.mediaId),
          eq(aiVideoMedia.userId, user.id)
        )
      )
  })

const bulkDeleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator(bulkDeleteMediaSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const uniqueIds = Array.from(new Set(data.mediaIds))
    const rows = await db
      .select()
      .from(aiVideoMedia)
      .where(
        and(
          eq(aiVideoMedia.userId, user.id),
          inArray(aiVideoMedia.id, uniqueIds)
        )
      )

    for (const row of rows) {
      await deleteFromR2(row.storagePath)
    }

    if (rows.length) {
      await db
        .delete(aiVideoMedia)
        .where(
          and(
            eq(aiVideoMedia.userId, user.id),
            inArray(
              aiVideoMedia.id,
              rows.map((row) => row.id)
            )
          )
        )
    }

    return { deleted_count: rows.length }
  })

export function listMedia({
  page = 1,
  pageSize = 20,
  fileType,
  sortBy,
  sortDirection,
}: {
  page?: number
  pageSize?: number
  fileType?: MediaFileType
  sortBy?: MediaSortBy
  sortDirection?: MediaSortDirection
} = {}) {
  return listMediaFn({ data: { page, pageSize, fileType, sortBy, sortDirection } })
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

export function deleteMedia(mediaId: string) {
  return deleteMediaFn({ data: { mediaId } })
}

export function bulkDeleteMedia(mediaIds: string[]) {
  return bulkDeleteMediaFn({ data: { mediaIds } })
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}
