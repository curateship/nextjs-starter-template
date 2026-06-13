import sanitizeHtml from "sanitize-html"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media-storage"
import { aiAgentsMedia, type AiAgentsMedia } from "@/server/schema"
import { uuid } from "@/server/security"

export const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
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
export type MediaSortBy =
  | "created_at"
  | "original_name"
  | "file_size"
  | "file_type"
export type MediaSortDirection = "asc" | "desc"

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
      "Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
    )
  }

  const fileType = getMediaFileType(mimeType)
  const maxSize = fileType === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  const maxSizeLabel = fileType === "image" ? "10MB" : "100MB"
  if (size > maxSize) {
    throw new Error(`File size too large. Maximum size is ${maxSizeLabel}.`)
  }
}

export function validateMediaContent(mimeType: string, data: Uint8Array) {
  if (mimeType === "image/svg+xml") {
    sanitizeSvgContent(data)
    return
  }

  const valid =
    (mimeType === "image/jpeg" || mimeType === "image/jpg") &&
      hasPrefix(data, [0xff, 0xd8, 0xff]) ||
    mimeType === "image/png" &&
      hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    mimeType === "image/gif" &&
      (hasAscii(data, 0, "GIF87a") || hasAscii(data, 0, "GIF89a")) ||
    mimeType === "image/webp" &&
      hasAscii(data, 0, "RIFF") &&
      hasAscii(data, 8, "WEBP") ||
    (mimeType === "video/mp4" || mimeType === "video/quicktime") &&
      hasAscii(data, 4, "ftyp") ||
    mimeType === "video/webm" &&
      hasPrefix(data, [0x1a, 0x45, 0xdf, 0xa3]) ||
    mimeType === "video/x-msvideo" &&
      hasAscii(data, 0, "RIFF") &&
      hasAscii(data, 8, "AVI ") ||
    mimeType === "video/x-matroska" &&
      hasPrefix(data, [0x1a, 0x45, 0xdf, 0xa3])

  if (!valid) {
    throw new Error("File content does not match the selected media type.")
  }
}

export function prepareMediaContent(mimeType: string, data: Uint8Array) {
  if (mimeType === "image/svg+xml") {
    return sanitizeSvgContent(data)
  }

  validateMediaContent(mimeType, data)
  return data
}

const svgSanitizeOptions = {
  allowedTags: "svg g path rect circle ellipse line polyline polygon title desc".split(" "),
  allowedAttributes: {
    svg: "xmlns viewBox width height role aria-label aria-labelledby fill stroke".split(" "),
    "*": "d x y x1 x2 y1 y2 cx cy r rx ry points fill stroke stroke-width opacity transform".split(" "),
  },
  parser: {
    lowerCaseAttributeNames: false,
    lowerCaseTags: false,
  },
} satisfies sanitizeHtml.IOptions

function sanitizeSvgContent(data: Uint8Array) {
  let source = ""
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    throw new Error("File content does not match the selected media type.")
  }

  const sanitized = sanitizeHtml(source, svgSanitizeOptions).trim()
  if (
    !/^<svg(?:\s|>)/i.test(sanitized) ||
    /(?:javascript:|data:|url\s*\()/i.test(sanitized)
  ) {
    throw new Error("File content does not match the selected media type.")
  }

  return new TextEncoder().encode(sanitized)
}

export function cleanOriginalName(filename?: string) {
  const name = (filename || "media").replace(/\\/g, "/").split("/").pop()?.trim()
  return (name || "media").slice(0, 255)
}

function hasPrefix(data: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => data[index] === byte)
}

function hasAscii(data: Uint8Array, offset: number, value: string) {
  if (data.length < offset + value.length) return false
  return Array.from(value).every(
    (character, index) => data[offset + index] === character.charCodeAt(0)
  )
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
  mimeType,
  sortBy = "created_at",
  sortDirection = "desc",
}: {
  userId: string
  page: number
  pageSize: number
  fileType?: MediaFileType
  mimeType?: "image/svg+xml"
  sortBy?: MediaSortBy
  sortDirection?: MediaSortDirection
}): Promise<MediaListResponse> {
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
  const ownerWhere = eq(aiAgentsMedia.userId, userId)
  const typeWhere = fileType ? eq(aiAgentsMedia.fileType, fileType) : null
  const mimeWhere = mimeType ? eq(aiAgentsMedia.mimeType, mimeType) : null
  const where =
    typeWhere && mimeWhere
      ? and(ownerWhere, typeWhere, mimeWhere)
      : typeWhere
        ? and(ownerWhere, typeWhere)
        : mimeWhere
          ? and(ownerWhere, mimeWhere)
          : ownerWhere

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiAgentsMedia)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(aiAgentsMedia)
    .where(where)
    .orderBy(getMediaOrderBy(sortBy, sortDirection))
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

function getMediaOrderBy(sortBy: MediaSortBy, sortDirection: MediaSortDirection) {
  const column =
    sortBy === "original_name"
      ? aiAgentsMedia.originalName
      : sortBy === "file_size"
        ? aiAgentsMedia.fileSize
        : sortBy === "file_type"
          ? aiAgentsMedia.fileType
          : aiAgentsMedia.createdAt

  return sortDirection === "asc" ? asc(column) : desc(column)
}

export async function getOwnedMedia(userId: string, mediaId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsMedia)
    .where(and(eq(aiAgentsMedia.id, mediaId), eq(aiAgentsMedia.userId, userId)))
    .limit(1)

  if (!row) {
    throw new Error("Media not found")
  }

  return row
}

export function serializeMedia(row: AiAgentsMedia): MediaItem {
  return {
    id: row.id,
    filename: row.filename,
    original_name: row.originalName,
    alt_text: row.altText,
    file_size: row.fileSize,
    mime_type: row.mimeType,
    file_type: row.fileType as MediaFileType,
    url: getPublicMediaUrl(row.storagePath),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function defaultExtensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg"
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/gif") return "gif"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/svg+xml") return "svg"
  if (mimeType === "video/mp4") return "mp4"
  if (mimeType === "video/webm") return "webm"
  if (mimeType === "video/quicktime") return "mov"
  if (mimeType === "video/x-msvideo") return "avi"
  if (mimeType === "video/x-matroska") return "mkv"
  return ""
}
