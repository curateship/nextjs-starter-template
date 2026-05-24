import { and, desc, eq, sql } from "drizzle-orm"
import sanitizeHtml from "sanitize-html"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media-storage"
import { aiVideoMedia, type AiVideoMedia } from "@/server/schema"
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
const SVG_MIME_TYPE = "image/svg+xml"
const SVG_ALLOWED_TAGS = [
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
]
const SVG_ALLOWED_ATTRIBUTES = [
  "xmlns",
  "viewBox",
  "width",
  "height",
  "role",
  "aria-label",
  "x",
  "y",
  "dx",
  "dy",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "x2",
  "y1",
  "y2",
  "d",
  "points",
  "transform",
  "fill",
  "stroke",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "vector-effect",
]
const SVG_ATTRIBUTE_NAMES = new Set([
  ...SVG_ALLOWED_ATTRIBUTES,
  "viewbox",
])

export type MediaFileType = "image" | "video"

export type MediaItem = {
  id: string
  workspace_id: string
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
    mimeType === SVG_MIME_TYPE &&
      isSvgDocument(data) ||
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

export function sanitizeMediaContent(mimeType: string, data: Uint8Array) {
  if (mimeType !== SVG_MIME_TYPE) {
    return data
  }

  const sanitized = sanitizeSvgText(decodeSvg(data))
  if (!/^<svg[\s>]/i.test(sanitized.trimStart())) {
    throw new Error("SVG content could not be sanitized.")
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

function isSvgDocument(data: Uint8Array) {
  return /<svg[\s>]/i.test(decodeSvg(data))
}

function decodeSvg(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    throw new Error("File content does not match the selected media type.")
  }
}

function sanitizeSvgText(svg: string) {
  const normalizedSvg = svg
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")

  return sanitizeHtml(normalizedSvg, {
    allowedTags: SVG_ALLOWED_TAGS,
    allowedAttributes: { "*": Array.from(SVG_ATTRIBUTE_NAMES) },
    allowedSchemes: [],
    allowedSchemesAppliedToAttributes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    parseStyleAttributes: false,
    parser: {
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      xmlMode: true,
    },
    transformTags: Object.fromEntries(
      SVG_ALLOWED_TAGS.map((tagName) => [
        tagName,
        (tag: string, attributes: Record<string, string>) => ({
          tagName: tag,
          attribs: cleanSvgAttributes(attributes),
        }),
      ])
    ),
  })
}

function cleanSvgAttributes(attributes: Record<string, string>) {
  const cleanAttributes: Record<string, string> = {}

  for (const [name, value] of Object.entries(attributes)) {
    const cleanName = name === "viewbox" ? "viewBox" : name
    if (!SVG_ALLOWED_ATTRIBUTES.includes(cleanName)) continue
    if (!isSafeSvgAttributeValue(cleanName, value)) continue
    cleanAttributes[cleanName] = value.trim()
  }

  return cleanAttributes
}

function isSafeSvgAttributeValue(name: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed || /[<>]/.test(trimmed)) return false
  if (name === "xmlns") return trimmed === "http://www.w3.org/2000/svg"

  const normalized = trimmed.replace(/\s+/g, "").toLowerCase()
  return !(
    normalized.includes("javascript:") ||
    normalized.includes("vbscript:") ||
    normalized.includes("data:") ||
    normalized.includes("file:") ||
    normalized.includes("http:") ||
    normalized.includes("https:") ||
    normalized.includes("//") ||
    normalized.includes("url(") ||
    normalized.includes("@import") ||
    normalized.includes("expression(")
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
  workspaceId,
  page,
  pageSize,
  fileType,
}: {
  userId: string
  workspaceId: string
  page: number
  pageSize: number
  fileType?: MediaFileType
}): Promise<MediaListResponse> {
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(1, pageSize), 100)
  const where = fileType
    ? and(
        eq(aiVideoMedia.userId, userId),
        eq(aiVideoMedia.workspaceId, workspaceId),
        eq(aiVideoMedia.fileType, fileType)
      )
    : and(eq(aiVideoMedia.userId, userId), eq(aiVideoMedia.workspaceId, workspaceId))

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiVideoMedia)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(aiVideoMedia)
    .where(where)
    .orderBy(desc(aiVideoMedia.createdAt))
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

export async function getOwnedMedia(
  userId: string,
  workspaceId: string,
  mediaId: string
) {
  const [row] = await db
    .select()
    .from(aiVideoMedia)
    .where(
      and(
        eq(aiVideoMedia.id, mediaId),
        eq(aiVideoMedia.userId, userId),
        eq(aiVideoMedia.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Media not found")
  }

  return row
}

export function serializeMedia(row: AiVideoMedia): MediaItem {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
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
  if (mimeType === SVG_MIME_TYPE) return "svg"
  if (mimeType === "video/mp4") return "mp4"
  if (mimeType === "video/webm") return "webm"
  if (mimeType === "video/quicktime") return "mov"
  if (mimeType === "video/x-msvideo") return "avi"
  if (mimeType === "video/x-matroska") return "mkv"
  return ""
}
