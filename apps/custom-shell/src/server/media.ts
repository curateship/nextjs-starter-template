import sanitizeHtml from "sanitize-html"
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  deleteFromR2,
  getPublicMediaUrl,
  listR2Objects,
  R2StorageNotConfiguredError,
} from "@/server/media-storage"
import {
  customShellMedia,
  customShellUsers,
  type CustomShellMedia,
} from "@/server/schema"
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
  const ownerWhere = eq(customShellMedia.userId, userId)
  const typeWhere = fileType ? eq(customShellMedia.fileType, fileType) : null
  const mimeWhere = mimeType ? eq(customShellMedia.mimeType, mimeType) : null
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
    .from(customShellMedia)
    .where(where)
  const total = totalRow?.count ?? 0
  const rows = await db
    .select()
    .from(customShellMedia)
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
      ? customShellMedia.originalName
      : sortBy === "file_size"
        ? customShellMedia.fileSize
        : sortBy === "file_type"
          ? customShellMedia.fileType
          : customShellMedia.createdAt

  return sortDirection === "asc" ? asc(column) : desc(column)
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
    url: getPublicMediaUrl(row.storagePath),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Admin-wide media. Everything below crosses account boundaries and is only
// ever reached through server functions that call requireAdmin() first.
// ---------------------------------------------------------------------------

/** How many bucket keys one orphan scan will read before giving up. */
const ORPHAN_SCAN_MAX_KEYS = 20000

/**
 * Uploads are stored at `<user id>/<filename>`. Anything else in the bucket was
 * put there by something other than this app, so an orphan sweep leaves it
 * alone rather than deleting a stranger's file.
 */
const APP_STORAGE_KEY = /^[0-9a-fA-F-]{36}\/.+/

export type AdminMediaSort = "file" | "owner" | "type" | "size" | "created"
export type AdminMediaTypeFilter = "all" | MediaFileType | "svg"

export type AdminMediaItem = MediaItem & {
  owner_id: string
  owner_name: string
  owner_email: string
  storage_path: string
}

export type AdminMediaListQuery = {
  search: string
  ownerId: string
  fileType: AdminMediaTypeFilter
  page: number
  pageSize: number
  sort: AdminMediaSort
  direction: MediaSortDirection
}

export type AdminMediaListResponse = {
  media: AdminMediaItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export type MediaOwner = { userId: string; name: string }

export type MediaOrphanKind = "missing_file" | "unlinked_object"

export type MediaOrphan = {
  kind: MediaOrphanKind
  mediaId: string | null
  storagePath: string
  name: string
  bytes: number
  ownerId: string | null
  ownerName: string | null
  createdAt: string | null
  fileType: MediaFileType | "other"
  /** Null when the file is gone, so there is nothing to preview. */
  url: string | null
}

type MediaOrphanScan = {
  orphans: MediaOrphan[]
  scannedObjects: number
  /** True when the bucket held more keys than one scan reads. */
  truncated: boolean
}

export type StorageUserRow = {
  userId: string
  name: string
  email: string
  files: number
  bytes: number
  orphanFiles: number
  orphanBytes: number
}

export type StorageDashboard = {
  users: StorageUserRow[]
  totalBytes: number
  /** Set when the bucket could not be read, so orphan numbers are unknown. */
  scanError: string | null
}

export type OrphanDashboard = {
  orphans: MediaOrphan[]
  scannedObjects: number
  truncated: boolean
  /** Everyone the orphans could be traced back to, for the owner filter. */
  owners: MediaOwner[]
  scanError: string | null
}

export async function listAllMedia(
  query: AdminMediaListQuery,
  database: CustomShellDb = db
): Promise<AdminMediaListResponse> {
  const page = Math.max(1, query.page)
  const pageSize = Math.min(Math.max(1, query.pageSize), 100)
  const where = buildAdminMediaWhere(query)
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    file: customShellMedia.originalName,
    owner: customShellUsers.name,
    type: customShellMedia.fileType,
    size: customShellMedia.fileSize,
    created: customShellMedia.createdAt,
  }[query.sort]

  const rows = await database
    .select({ media: customShellMedia, owner: customShellUsers })
    .from(customShellMedia)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellMedia.userId)
    )
    .where(where)
    .orderBy(direction(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totals] = await database
    .select({ total: count() })
    .from(customShellMedia)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellMedia.userId)
    )
    .where(where)

  const total = totals?.total ?? 0

  return {
    media: rows.map((row) => ({
      ...serializeMedia(row.media),
      owner_id: row.owner.id,
      owner_name: row.owner.name,
      owner_email: row.owner.email,
      storage_path: row.media.storagePath,
    })),
    total,
    page,
    page_size: pageSize,
    total_pages: total ? Math.ceil(total / pageSize) : 0,
  }
}

function buildAdminMediaWhere(query: AdminMediaListQuery) {
  const filters: SQL[] = []
  const search = query.search.trim()

  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(customShellMedia.originalName, pattern),
      ilike(customShellMedia.filename, pattern),
      ilike(customShellUsers.name, pattern),
      ilike(customShellUsers.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.ownerId !== "all") {
    filters.push(eq(customShellMedia.userId, query.ownerId))
  }
  if (query.fileType === "svg") {
    filters.push(eq(customShellMedia.mimeType, "image/svg+xml"))
  } else if (query.fileType !== "all") {
    filters.push(eq(customShellMedia.fileType, query.fileType))
  }

  return filters.length ? and(...filters) : undefined
}

/** Just enough to fill the media page's owner filter. */
export async function listMediaOwners(
  database: CustomShellDb = db
): Promise<MediaOwner[]> {
  const rows = await database
    .selectDistinct({
      userId: customShellUsers.id,
      name: customShellUsers.name,
    })
    .from(customShellMedia)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellMedia.userId)
    )
    .orderBy(asc(customShellUsers.name))

  return rows
}

/** The orphan list, with the people it could be traced to. */
export async function loadOrphanDashboard(
  database: CustomShellDb = db
): Promise<OrphanDashboard> {
  const { scan, scanError } = await tryScanMediaOrphans(database)
  const owners = new Map<string, MediaOwner>()
  for (const orphan of scan.orphans) {
    if (orphan.ownerId && orphan.ownerName) {
      owners.set(orphan.ownerId, {
        userId: orphan.ownerId,
        name: orphan.ownerName,
      })
    }
  }

  return {
    orphans: scan.orphans,
    scannedObjects: scan.scannedObjects,
    truncated: scan.truncated,
    owners: Array.from(owners.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    scanError,
  }
}

/**
 * A bucket that cannot be read is reported rather than swallowed, so a page can
 * still show the numbers it does have.
 */
async function tryScanMediaOrphans(database: CustomShellDb) {
  try {
    return { scan: await scanMediaOrphans(database), scanError: null }
  } catch (error) {
    return {
      scan: { orphans: [], scannedObjects: 0, truncated: false },
      scanError:
        error instanceof R2StorageNotConfiguredError
          ? "R2_NOT_CONFIGURED"
          : "SCAN_FAILED",
    } satisfies { scan: MediaOrphanScan; scanError: string }
  }
}

/**
 * Who is storing what, with their orphans folded in. Someone can hold orphans
 * without holding any live media, so the two sources are merged rather than
 * joined.
 */
export async function loadStorageDashboard(
  database: CustomShellDb = db
): Promise<StorageDashboard> {
  const bytesColumn = sql<number>`coalesce(sum(${customShellMedia.fileSize}), 0)::bigint`
  const usage = await database
    .select({
      userId: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
      files: count(),
      bytes: bytesColumn,
    })
    .from(customShellMedia)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellMedia.userId)
    )
    .groupBy(customShellUsers.id, customShellUsers.name, customShellUsers.email)
    .orderBy(desc(bytesColumn))

  const { scan, scanError } = await tryScanMediaOrphans(database)

  const users = new Map<string, StorageUserRow>()
  for (const row of usage) {
    users.set(row.userId, {
      userId: row.userId,
      name: row.name,
      email: row.email,
      files: row.files,
      bytes: Number(row.bytes),
      orphanFiles: 0,
      orphanBytes: 0,
    })
  }

  // Someone can hold orphans without holding any live media — a deleted row or
  // a file whose record went away still belongs to whoever uploaded it. Their
  // name and email come from the lookup below, not from the orphan.
  const strays = new Map<string, { files: number; bytes: number }>()
  for (const orphan of scan.orphans) {
    if (!orphan.ownerId) continue
    const existing = users.get(orphan.ownerId)
    if (existing) {
      existing.orphanFiles += 1
      existing.orphanBytes += orphan.bytes
      continue
    }
    const stray = strays.get(orphan.ownerId) ?? { files: 0, bytes: 0 }
    stray.files += 1
    stray.bytes += orphan.bytes
    strays.set(orphan.ownerId, stray)
  }

  if (strays.size) {
    const strayUsers = await database
      .select({
        id: customShellUsers.id,
        name: customShellUsers.name,
        email: customShellUsers.email,
      })
      .from(customShellUsers)
      .where(inArray(customShellUsers.id, Array.from(strays.keys())))

    for (const user of strayUsers) {
      const stray = strays.get(user.id)
      if (!stray) continue
      users.set(user.id, {
        userId: user.id,
        name: user.name,
        email: user.email,
        files: 0,
        bytes: 0,
        orphanFiles: stray.files,
        orphanBytes: stray.bytes,
      })
    }
  }

  return {
    users: Array.from(users.values()).sort((a, b) => b.bytes - a.bytes),
    totalBytes: usage.reduce((sum, row) => sum + Number(row.bytes), 0),
    scanError,
  }
}

/**
 * Compares the media table against the bucket in both directions: rows whose
 * file is gone, and files no row points at. When the bucket is bigger than one
 * scan reads, the missing-file half is skipped — a key we never looked at is
 * not evidence the file is missing.
 */
async function scanMediaOrphans(
  database: CustomShellDb = db
): Promise<MediaOrphanScan> {
  const { objects, truncated } = await listR2Objects(ORPHAN_SCAN_MAX_KEYS)
  const storedKeys = new Set(objects.map((object) => object.key))

  const rows = await database
    .select({ media: customShellMedia, owner: customShellUsers })
    .from(customShellMedia)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellMedia.userId)
    )
    .orderBy(desc(customShellMedia.createdAt))

  const knownPaths = new Set(rows.map((row) => row.media.storagePath))
  const orphans: MediaOrphan[] = []

  if (!truncated) {
    for (const row of rows) {
      if (storedKeys.has(row.media.storagePath)) continue
      orphans.push({
        kind: "missing_file",
        mediaId: row.media.id,
        storagePath: row.media.storagePath,
        name: row.media.originalName,
        bytes: row.media.fileSize,
        ownerId: row.owner.id,
        ownerName: row.owner.name,
        createdAt: row.media.createdAt.toISOString(),
        fileType: row.media.fileType as MediaFileType,
        // The file is gone, so its URL would only ever 404.
        url: null,
      })
    }
  }

  // A key is `<uploader id>/<filename>`, so a file that lost its record can
  // still be traced back to a person.
  const unlinked = objects
    .filter(
      (object) => !knownPaths.has(object.key) && APP_STORAGE_KEY.test(object.key)
    )
    .map((object) => {
      const [ownerId, ...rest] = object.key.split("/")
      return { ...object, ownerId, filename: rest.join("/") }
    })
  const owners = await findUsersByIds(
    Array.from(new Set(unlinked.map((object) => object.ownerId))),
    database
  )

  for (const object of unlinked) {
    const owner = owners.get(object.ownerId)
    orphans.push({
      kind: "unlinked_object",
      mediaId: null,
      storagePath: object.key,
      name: object.filename || object.key,
      bytes: object.size,
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? null,
      createdAt: null,
      fileType: fileTypeFromKey(object.key),
      // The file is still there, so it can be previewed before it is erased.
      url: getPublicMediaUrl(object.key),
    })
  }

  return { orphans, scannedObjects: objects.length, truncated }
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"])
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv"])

/** A stray file has no record, so its extension is all there is to go on. */
function fileTypeFromKey(key: string): MediaFileType | "other" {
  const extension = key.split(".").pop()?.toLowerCase() ?? ""
  if (IMAGE_EXTENSIONS.has(extension)) return "image"
  if (VIDEO_EXTENSIONS.has(extension)) return "video"
  return "other"
}

async function findUsersByIds(ids: string[], database: CustomShellDb) {
  if (!ids.length) return new Map<string, { id: string; name: string }>()

  const rows = await database
    .select({ id: customShellUsers.id, name: customShellUsers.name })
    .from(customShellUsers)
    .where(inArray(customShellUsers.id, ids))

  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * Removes only entries the server can still prove are orphans, so a stale page
 * (or a crafted request) can never delete a live file or an unrelated object.
 */
export async function cleanMediaOrphans(
  input: { mediaIds: string[]; storagePaths: string[] },
  database: CustomShellDb = db
) {
  const scan = await scanMediaOrphans(database)
  const requestedIds = new Set(input.mediaIds)
  const requestedPaths = new Set(input.storagePaths)

  const rowsToDelete = scan.orphans
    .filter(
      (orphan) => orphan.kind === "missing_file" && requestedIds.has(orphan.mediaId ?? "")
    )
    .map((orphan) => orphan.mediaId as string)
  const objectsToDelete = scan.orphans
    .filter(
      (orphan) =>
        orphan.kind === "unlinked_object" && requestedPaths.has(orphan.storagePath)
    )
    .map((orphan) => orphan.storagePath)

  for (const storagePath of objectsToDelete) {
    await deleteFromR2(storagePath)
  }

  if (rowsToDelete.length) {
    await database
      .delete(customShellMedia)
      .where(inArray(customShellMedia.id, rowsToDelete))
  }

  return { deletedCount: rowsToDelete.length + objectsToDelete.length }
}

/** Deletes any owner's media, file first so a failure never strands the file. */
export async function deleteMediaAsAdmin(
  mediaIds: string[],
  database: CustomShellDb = db
) {
  const uniqueIds = Array.from(new Set(mediaIds))
  const rows = await database
    .select()
    .from(customShellMedia)
    .where(inArray(customShellMedia.id, uniqueIds))

  for (const row of rows) {
    await deleteFromR2(row.storagePath)
  }

  if (rows.length) {
    await database.delete(customShellMedia).where(
      inArray(
        customShellMedia.id,
        rows.map((row) => row.id)
      )
    )
  }

  return { deletedCount: rows.length }
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
