import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import {
  cleanAltText,
  createMediaFromBytes,
  getOwnedMedia,
  listOwnedMedia,
  serializeMedia,
  validateMediaFile,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
  type MediaSortBy,
  type MediaSortDirection,
} from "@/server/media"
import { deleteFromR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import {
  media,
  providerResults,
  providerRunConfigs,
  providerSettings,
  workspaces,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"

export type { MediaFileType, MediaItem, MediaListResponse, MediaSortBy, MediaSortDirection }

export type UnusedImagesResponse = {
  media: MediaItem[]
  total: number
  scanned_at: string
}

const BULK_DELETE_MEDIA_LIMIT = 500
const UNUSED_IMAGE_SCAN_BATCH_SIZE = 500

const listMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    fileType: z.enum(["image", "video"]).optional(),
    mimeType: z.enum(["image/svg+xml"]).optional(),
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
  mediaIds: z.array(z.string().min(1)).min(1).max(BULK_DELETE_MEDIA_LIMIT),
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
      mimeType: data?.mimeType,
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

    const createdAt = now()
    const row = await createMediaFromBytes({
      userId: user.id,
      originalName: data.file.name,
      altText: data.altText,
      mimeType,
      data: rawFileData,
      createdAt,
    })

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
      .update(media)
      .set({ altText: cleanAltText(data.altText), updatedAt })
      .where(
        and(
          eq(media.id, data.mediaId),
          eq(media.userId, user.id)
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
      .delete(media)
      .where(
        and(
          eq(media.id, data.mediaId),
          eq(media.userId, user.id)
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
      .from(media)
      .where(
        and(
          eq(media.userId, user.id),
          inArray(media.id, uniqueIds)
        )
      )

    for (const row of rows) {
      await deleteFromR2(row.storagePath)
    }

    if (rows.length) {
      await db
        .delete(media)
        .where(
          and(
            eq(media.userId, user.id),
            inArray(
              media.id,
              rows.map((row) => row.id)
            )
          )
        )
    }

    return { deleted_count: rows.length }
  })

const scanUnusedImagesFn = createServerFn({ method: "GET" })
  .handler(async (): Promise<UnusedImagesResponse> => {
    const user = await requireUser()
    const imageRows = await db
      .select()
      .from(media)
      .where(and(eq(media.userId, user.id), eq(media.fileType, "image")))
      .orderBy(desc(media.createdAt))

    const imageItems = imageRows.map(serializeMedia)
    const referencedIds = new Set<string>()

    for (let index = 0; index < imageItems.length; index += UNUSED_IMAGE_SCAN_BATCH_SIZE) {
      const batch = imageItems.slice(index, index + UNUSED_IMAGE_SCAN_BATCH_SIZE)
      const values = sql.join(batch.map((item) => sql`(${item.id}, ${item.url})`), sql`, `)
      const result = await db.execute<{ id: string }>(sql`
        with candidates(id, url) as (values ${values})
        select distinct c.id
        from candidates c
        where exists (
          select 1
          from ${workspaces} w
          where w.user_id = ${user.id}
            and (
              position(c.url in coalesce(w.settings::text, '')) > 0
              or position(c.id in coalesce(w.settings::text, '')) > 0
            )
        )
        or exists (
          select 1
          from ${providerSettings} ps
          join ${workspaces} w on w.id = ps.workspace_id
          where w.user_id = ${user.id}
            and (
              position(c.url in coalesce(ps.config::text, '')) > 0
              or position(c.id in coalesce(ps.config::text, '')) > 0
            )
        )
        or exists (
          select 1
          from ${providerRunConfigs} rc
          join ${workspaces} w on w.id = rc.workspace_id
          where w.user_id = ${user.id}
            and (
              position(c.url in coalesce(rc.input::text, '')) > 0
              or position(c.id in coalesce(rc.input::text, '')) > 0
              or position(c.url in coalesce(rc.metadata::text, '')) > 0
              or position(c.id in coalesce(rc.metadata::text, '')) > 0
            )
        )
        or exists (
          select 1
          from ${providerResults} pr
          join ${providerRunConfigs} rc on rc.id = pr.run_config_id
          join ${workspaces} w on w.id = rc.workspace_id
          where w.user_id = ${user.id}
            and (
              position(c.url in coalesce(pr.data::text, '')) > 0
              or position(c.id in coalesce(pr.data::text, '')) > 0
            )
        )
      `)
      result.rows.forEach((row) => referencedIds.add(row.id))
    }

    const unusedImages = imageItems.filter((item) => !referencedIds.has(item.id))

    return {
      media: unusedImages,
      total: unusedImages.length,
      scanned_at: new Date().toISOString(),
    }
  })

export function listMedia({
  page = 1,
  pageSize = 20,
  fileType,
  mimeType,
  sortBy,
  sortDirection,
}: {
  page?: number
  pageSize?: number
  fileType?: MediaFileType
  mimeType?: "image/svg+xml"
  sortBy?: MediaSortBy
  sortDirection?: MediaSortDirection
} = {}) {
  return listMediaFn({ data: { page, pageSize, fileType, mimeType, sortBy, sortDirection } })
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

export function scanUnusedImages() {
  return scanUnusedImagesFn()
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Core session")
  }
  return user
}
