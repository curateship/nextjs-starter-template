import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { customShellMedia, type CustomShellMedia } from "@/server/schema"
import { uuid } from "@/server/security"

export const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
])
export const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
])
export const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES])

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 100 * 1024 * 1024
const FILENAME_SAFE_CHARS = /[^a-zA-Z0-9.-]+/g

export type MediaFileType = "image" | "video"

export type MediaItem = {
  id: string
  filename: string
  original_name: string
  alt_text: string | null
  file_size: number
  mime_type: string
  file_type: MediaFileType
  url: string
  created_at: string
  updated_at: string
}

export type MediaListResponse = {
  media: MediaItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function getMediaFileType(mimeType: string): MediaFileType {
  return IMAGE_TYPES.has(mimeType) ? "image" : "video"
}

export function validateMediaFile(mimeType: string, size: number) {
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new Error(
      "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
    )
  }

  const fileType = getMediaFileType(mimeType)
  const maxSize = fileType === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  const maxSizeLabel = fileType === "image" ? "10MB" : "100MB"
  if (size > maxSize) {
    throw new Error(`File size too large. Maximum size is ${maxSizeLabel}.`)
  }
}

export function cleanOriginalName(filename?: string) {
  const name = (filename || "media").replace(/\\/g, "/").split("/").pop()?.trim()
  return (name || "media").slice(0, 255)
}

export function storedFilename(originalName: string, mimeType: string) {
  const extensionIndex = originalName.lastIndexOf(".")
  const base =
    extensionIndex > -1 ? originalName.slice(0, extensionIndex) : originalName
  const originalExtension =
    extensionIndex > -1 ? originalName.slice(extensionIndex + 1) : ""
  const extension = originalExtension || defaultExtensionForMimeType(mimeType)
  const cleanBase = base.replace(FILENAME_SAFE_CHARS, "-").replace(/^[.-]+|[.-]+$/g, "") || "media"
  const cleanExtension = extension.replace(FILENAME_SAFE_CHARS, "").replace(/^\.+|\.+$/g, "")
  const suffix = cleanExtension ? `.${cleanExtension}` : ""
  return `${uuid()}_${cleanBase}${suffix}`.slice(0, 255)
}

export function cleanAltText(value?: string | null) {
  const cleaned = value?.trim() || ""
  return cleaned ? cleaned.slice(0, 500) : null
}

export async function listOwnedMedia({
  userId,
  page,
  pageSize,
  fileType,
}: {
  userId: string
  page: number
  pageSize: number
  fileType?: MediaFileType
}): Promise<MediaListResponse> {
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
  const where = fileType
    ? and(eq(customShellMedia.userId, userId), eq(customShellMedia.fileType, fileType))
    : eq(customShellMedia.userId, userId)

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellMedia)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(customShellMedia)
    .where(where)
    .orderBy(desc(customShellMedia.createdAt))
    .offset((normalizedPage - 1) * normalizedPageSize)
    .limit(normalizedPageSize)

  return {
    media: rows.map(serializeMedia),
    total,
    page: normalizedPage,
    page_size: normalizedPageSize,
    total_pages: total ? Math.ceil(total / normalizedPageSize) : 0,
  }
}

export async function getOwnedMedia(userId: string, mediaId: string) {
  const [row] = await db
    .select()
    .from(customShellMedia)
    .where(and(eq(customShellMedia.id, mediaId), eq(customShellMedia.userId, userId)))
    .limit(1)

  if (!row) {
    throw new Error("Media not found")
  }

  return row
}

export function serializeMedia(row: CustomShellMedia): MediaItem {
  return {
    id: row.id,
    filename: row.filename,
    original_name: row.originalName,
    alt_text: row.altText,
    file_size: row.fileSize,
    mime_type: row.mimeType,
    file_type: row.fileType as MediaFileType,
    url: `/api/v1/media/${row.id}/file?name=${encodeURIComponent(row.filename)}`,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function defaultExtensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg"
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/gif") return "gif"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "video/mp4") return "mp4"
  if (mimeType === "video/webm") return "webm"
  if (mimeType === "video/quicktime") return "mov"
  if (mimeType === "video/x-msvideo") return "avi"
  if (mimeType === "video/x-matroska") return "mkv"
  return ""
}
