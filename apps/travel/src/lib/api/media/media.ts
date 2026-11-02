import { createServerFn } from "@tanstack/react-start"
import { describeAuthError } from "../error-message"
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
import {
  deleteFromR2,
  getPublicMediaUrl,
  R2StorageNotConfiguredError,
  uploadToR2,
} from "@/server/media/storage"
import {
  cancelVideoUpload,
  finishVideoUpload,
  signVideoUploadPart,
  startVideoUpload,
} from "@/server/media/video-upload"
import { VIDEO_MIME_TYPES } from "@/lib/media/media-upload"
import { sendFileInParts } from "@/lib/media/upload-in-parts"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { customShellMedia } from "@/server/schema"
import { now } from "@/server/auth/security"
import { userGet, userPost } from "@/server/guards"
import {
  findWorkspaceIdForRequest,
  workspaceIdForRequest,
} from "@/server/workspaces/for-request"
import { uuid } from "@/server/auth/security"

export type { MediaFileType, MediaItem, MediaListResponse }
export type { MediaSortBy, MediaSortDirection }

const listMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
    fileType: z.enum(["image", "video", "audio"]).optional(),
    mimeType: z.enum(["image/svg+xml"]).optional(),
    sortBy: z.enum(["created_at", "original_name", "file_size", "file_type"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .optional()

const updateMediaSchema = z.object({
  mediaId: z.string().min(1),
  altText: z.string(),
})

// Generous enough for a big drag-and-drop batch; only sustained hammering hits
// it. A video counts once, when it starts, however many pieces it has.
const UPLOAD_RATE_LIMIT = { maxAttempts: 60, windowSeconds: 10 * 60 }

const STORAGE_NOT_SET_UP =
  "File storage is not set up. Fill in the bucket, including its public address, under Settings \u2192 Storage."

const videoUploadKeySchema = z.object({
  storagePath: z.string().min(1).max(600),
  uploadId: z.string().min(1).max(1024),
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
    // Worked out here rather than sent by the browser. Every screen that opens
    // the picker — the page editor, settings, the newsletter builder, the
    // profile photo field — therefore gets the right site without having to
    // know there is such a thing.
    const workspaceId = await findWorkspaceIdForRequest(context.user.id)
    if (!workspaceId) {
      return { media: [], total: 0, page: 1, page_size: 0, total_pages: 0 }
    }

    return listOwnedMedia({
      workspaceId,
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
    if (getMediaFileType(mimeType) === "video") {
      throw new Error("Videos upload in pieces. Reload the page and try again.")
    }

    await enforceRateLimit(`media-upload:${context.user.id}`, UPLOAD_RATE_LIMIT)

    const rawFileData = new Uint8Array(await data.file.arrayBuffer())
    if (!rawFileData.byteLength) {
      throw new Error("File is empty")
    }
    const fileData = prepareMediaContent(mimeType, rawFileData)

    const originalName = cleanOriginalName(data.file.name)
    const filename = storedFilename(originalName, mimeType)
    const storagePath = `${context.user.id}/${filename}`

    try {
      // Library records hand this address to browsers, so fail before writing
      // anything if direct public delivery is not configured.
      await getPublicMediaUrl(storagePath)
      await uploadToR2(storagePath, fileData, mimeType)
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error(STORAGE_NOT_SET_UP)
      }
      throw new Error("Upload failed")
    }

    const createdAt = now()
    const row = {
      id: uuid(),
      // The site it was uploaded on is the site it belongs to.
      workspaceId: await workspaceIdForRequest(context.user.id),
      userId: context.user.id,
      filename,
      originalName,
      altText: cleanAltText(data.altText),
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

    return serializeMedia(row)
  })

const startVideoUploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().max(1000),
      mimeType: z.string().max(200),
      size: z.number().int().nonnegative(),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`media-upload:${context.user.id}`, UPLOAD_RATE_LIMIT)

    try {
      return await startVideoUpload({ userId: context.user.id, ...data })
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error(STORAGE_NOT_SET_UP)
      }
      throw error
    }
  })

const signVideoUploadPartFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    videoUploadKeySchema.extend({
      partNumber: z.number().int(),
      size: z.number().int(),
    })
  )
  .handler(({ data, context }) =>
    signVideoUploadPart({ userId: context.user.id, ...data })
  )

const finishVideoUploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    videoUploadKeySchema.extend({
      parts: z
        .array(
          z.object({
            partNumber: z.number().int().min(1),
            etag: z.string().min(1).max(200),
          })
        )
        .min(1)
        .max(10000),
      originalName: z.string().max(1000),
      altText: z.string().optional(),
    })
  )
  .handler(async ({ data, context }) =>
    finishVideoUpload({
      userId: context.user.id,
      // The site it was uploaded on is the site it belongs to.
      workspaceId: await workspaceIdForRequest(context.user.id),
      ...data,
    })
  )

const cancelVideoUploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(videoUploadKeySchema)
  .handler(async ({ data, context }) => {
    await cancelVideoUpload({ userId: context.user.id, ...data })
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

export type UploadMediaOptions = {
  /** How far a video has got, from 0 to 1. Images arrive in one go and never call it. */
  onProgress?: (fraction: number) => void
  /** Aborting it cancels a video upload and leaves nothing behind. */
  signal?: AbortSignal
}

/**
 * The one way a browser adds a file to the library. Images and sound go to
 * this server in one request, which sanitizes an SVG on the way. Videos are
 * too big for that and go straight to the bucket in pieces.
 */
export function uploadMedia(
  file: File,
  altText?: string,
  options: UploadMediaOptions = {}
): Promise<MediaItem> {
  if (VIDEO_MIME_TYPES.includes(file.type)) {
    return uploadVideoInParts(file, altText, options)
  }

  const formData = new FormData()
  formData.append("file", file)
  if (altText?.trim()) {
    formData.append("alt_text", altText.trim())
  }
  return uploadMediaFn({ data: formData })
}

async function uploadVideoInParts(
  file: File,
  altText: string | undefined,
  { onProgress, signal }: UploadMediaOptions
) {
  const ticket = await startVideoUploadFn({
    data: { name: file.name, mimeType: file.type, size: file.size },
  })
  const key = { storagePath: ticket.storagePath, uploadId: ticket.uploadId }

  try {
    const parts = await sendFileInParts({
      file,
      partBytes: ticket.partBytes,
      partCount: ticket.partCount,
      signPart: (partNumber, size) =>
        signVideoUploadPartFn({ data: { ...key, partNumber, size } }),
      onProgress,
      signal,
    })
    return await finishVideoUploadFn({
      data: { ...key, parts, originalName: file.name, altText: altText?.trim() },
    })
  } catch (error) {
    // Throws away whatever pieces reached the bucket. Once finishing has
    // started the pieces are already joined, and finishing cleans up after
    // itself, so a refusal here is expected and not worth reporting.
    await cancelVideoUploadFn({ data: key }).catch(() => undefined)
    throw error
  }
}

export function updateMedia(mediaId: string, altText: string) {
  return updateMediaFn({ data: { mediaId, altText } })
}
