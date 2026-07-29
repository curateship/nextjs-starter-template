import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  DEFAULT_MEDIA_UPLOAD_MAX_MB,
  MEDIA_UPLOAD_MAX_MB_LIMIT,
} from "@/lib/ai-video"
import { db } from "@/server/db"
import {
  collectionIdsByMedia,
  requireOwnedCollection,
} from "@/server/media-collections"
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
  type MediaSource,
  type MediaSortBy,
  type MediaSortDirection,
} from "@/server/media"
import {
  deleteFromR2,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media-storage"
import {
  MEDIA_FILMSTRIP_PROFILE,
  MEDIA_PROXY_PROFILE,
} from "@/server/media-types"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoMedia, aiVideoProjects, aiVideoSettings } from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"

export type { MediaFileType, MediaItem, MediaListResponse }
export type { MediaSortBy, MediaSortDirection, MediaSource }

const listMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    // A collection id filters to its members; null filters to media in no
    // collection at all (the "Uncollected" option).
    collectionId: z.string().min(1).max(36).nullable().optional(),
    fileTypes: z
      .array(z.enum(["image", "video", "audio"]))
      .min(1)
      .max(3)
      .optional(),
    mimeType: z.enum(["image/svg+xml"]).optional(),
    projectId: z.string().min(1).max(36).nullable().optional(),
    proxyStatus: z.literal("ready").optional(),
    search: z.string().max(200).optional(),
    source: z.enum(["upload", "generated", "template", "viral"]).optional(),
    sortBy: z
      .enum(["created_at", "original_name", "file_size", "file_type"])
      .optional(),
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

const activeMediaUploads = new Set<string>()

async function loadMediaUploadMaxBytes() {
  const [row] = await db
    .select({ settings: aiVideoSettings.settings })
    .from(aiVideoSettings)
    .where(eq(aiVideoSettings.key, "default"))
    .limit(1)

  const settings = row?.settings
  const maxMb =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as { mediaUploadMaxMb?: unknown }).mediaUploadMaxMb
      : undefined

  return (
    (typeof maxMb === "number" &&
    Number.isInteger(maxMb) &&
    maxMb >= 1 &&
    maxMb <= MEDIA_UPLOAD_MAX_MB_LIMIT
      ? maxMb
      : DEFAULT_MEDIA_UPLOAD_MAX_MB) *
    1024 *
    1024
  )
}

async function requireOwnedProjectId(userId: string, projectId?: string) {
  if (!projectId) return undefined

  const [row] = await db
    .select({ id: aiVideoProjects.id })
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, userId))
    )
    .limit(1)

  if (!row) {
    throw new Error("Project not found")
  }

  return row.id
}

const listMediaFn = createServerFn({ method: "GET" })
  .inputValidator(listMediaSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const projectId =
      data?.projectId === null
        ? null
        : await requireOwnedProjectId(user.id, data?.projectId)
    // Prove ownership before the id reaches the query, so a borrowed
    // collection id cannot expose another account's media.
    if (data?.collectionId) {
      await requireOwnedCollection(user.id, data.collectionId)
    }
    return listOwnedMedia({
      userId: user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 20,
      collectionId: data?.collectionId,
      fileTypes: data?.fileTypes,
      mimeType: data?.mimeType,
      projectId,
      proxyStatus: data?.proxyStatus,
      search: data?.search,
      source: data?.source,
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
      projectId: data.get("project_id")?.toString() || undefined,
    }
  })
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const projectId = await requireOwnedProjectId(user.id, data.projectId)
    if (activeMediaUploads.has(user.id)) {
      throw new Error("Another media upload is already in progress.")
    }

    activeMediaUploads.add(user.id)
    try {
      const mimeType = data.file.type || "application/octet-stream"
      validateMediaFile(
        mimeType,
        data.file.size,
        await loadMediaUploadMaxBytes()
      )

      const rawFileData = new Uint8Array(await data.file.arrayBuffer())
      if (!rawFileData.byteLength) {
        throw new Error("File is empty")
      }
      const fileData = prepareMediaContent(mimeType, rawFileData)

      const originalName = cleanOriginalName(data.file.name)
      const filename = storedFilename(originalName, mimeType)
      const storagePath = projectId
        ? `projects/${user.id}/${projectId}/${filename}`
        : `${user.id}/${filename}`

      try {
        await uploadToR2(storagePath, fileData, mimeType)
      } catch (error) {
        if (error instanceof R2StorageNotConfiguredError) {
          throw new Error(
            "R2 storage is not configured. Set the AI_VIDEO_R2_* environment variables."
          )
        }
        throw new Error("Upload failed")
      }

      const createdAt = now()
      const fileType = getMediaFileType(mimeType)
      const row = {
        id: uuid(),
        userId: user.id,
        filename,
        originalName,
        altText: cleanAltText(data.altText),
        fileSize: fileData.byteLength,
        mimeType,
        fileType,
        storagePath,
        projectId: projectId ?? null,
        source: "upload" as const,
        proxyStatus: fileType === "video" ? "queued" : null,
        proxyProfile: fileType === "video" ? MEDIA_PROXY_PROFILE : null,
        filmstripStatus: fileType === "video" ? "queued" : null,
        filmstripProfile:
          fileType === "video" ? MEDIA_FILMSTRIP_PROFILE : null,
        createdAt,
        updatedAt: createdAt,
      }

      try {
        await db.insert(aiVideoMedia).values(row)
        if (fileType === "video") {
          void import("@/server/media-proxy").then((module) =>
            module.kickMediaProxyWorker()
          )
        }
      } catch (error) {
        await deleteFromR2(storagePath).catch(() => undefined)
        throw error
      }

      return serializeMedia(row)
    } finally {
      activeMediaUploads.delete(user.id)
    }
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
        and(eq(aiVideoMedia.id, data.mediaId), eq(aiVideoMedia.userId, user.id))
      )

    const row = await getOwnedMedia(user.id, data.mediaId)
    const collections = await collectionIdsByMedia([row.id])
    return serializeMedia(row, collections.get(row.id) ?? [])
  })

const deleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator(mediaIdSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const [row] = await db
      .delete(aiVideoMedia)
      .where(
        and(eq(aiVideoMedia.id, data.mediaId), eq(aiVideoMedia.userId, user.id))
      )
      .returning({
        storagePath: aiVideoMedia.storagePath,
        proxyStoragePath: aiVideoMedia.proxyStoragePath,
        filmstripStoragePath: aiVideoMedia.filmstripStoragePath,
      })

    if (!row) {
      throw new Error("Media not found")
    }

    await deleteFromR2(row.storagePath).catch(() => undefined)
    if (row.proxyStoragePath) {
      await deleteFromR2(row.proxyStoragePath).catch(() => undefined)
    }
    if (row.filmstripStoragePath) {
      await deleteFromR2(row.filmstripStoragePath).catch(() => undefined)
    }
  })

const bulkDeleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator(bulkDeleteMediaSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const uniqueIds = Array.from(new Set(data.mediaIds))
    const rows = await db
      .delete(aiVideoMedia)
      .where(
        and(
          eq(aiVideoMedia.userId, user.id),
          inArray(aiVideoMedia.id, uniqueIds)
        )
      )
      .returning({
        storagePath: aiVideoMedia.storagePath,
        proxyStoragePath: aiVideoMedia.proxyStoragePath,
        filmstripStoragePath: aiVideoMedia.filmstripStoragePath,
      })

    await Promise.all(
      rows.flatMap((row) =>
        [row.storagePath, row.proxyStoragePath, row.filmstripStoragePath]
          .filter((storagePath): storagePath is string => !!storagePath)
          .map((storagePath) =>
            deleteFromR2(storagePath).catch(() => undefined)
          )
      )
    )

    return { deleted_count: rows.length }
  })

export function listMedia({
  page = 1,
  pageSize = 20,
  collectionId,
  fileTypes,
  mimeType,
  projectId,
  proxyStatus,
  search,
  source,
  sortBy,
  sortDirection,
}: {
  page?: number
  pageSize?: number
  collectionId?: string | null
  fileTypes?: MediaFileType[]
  mimeType?: "image/svg+xml"
  projectId?: string | null
  proxyStatus?: "ready"
  search?: string
  source?: MediaSource
  sortBy?: MediaSortBy
  sortDirection?: MediaSortDirection
} = {}) {
  return listMediaFn({
    data: {
      page,
      pageSize,
      collectionId,
      fileTypes,
      mimeType,
      projectId,
      proxyStatus,
      search,
      source,
      sortBy,
      sortDirection,
    },
  })
}

export function uploadMedia(
  file: File,
  altText?: string,
  options: { projectId?: string } = {}
) {
  const formData = new FormData()
  formData.append("file", file)
  if (altText?.trim()) {
    formData.append("alt_text", altText.trim())
  }
  if (options.projectId) {
    formData.append("project_id", options.projectId)
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
