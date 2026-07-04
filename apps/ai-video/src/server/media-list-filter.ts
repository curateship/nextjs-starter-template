import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"

import { aiVideoMedia } from "./schema.ts"

export type MediaFileType = "image" | "video" | "audio"
export type MediaSource = "upload" | "generated" | "template" | "viral"
export type MediaSortBy =
  | "created_at"
  | "original_name"
  | "file_size"
  | "file_type"
export type MediaSortDirection = "asc" | "desc"

export function normalizeMediaListPage(page: number, pageSize: number) {
  return {
    normalizedPage: Math.max(1, page),
    normalizedPageSize: Math.min(Math.max(1, pageSize), 100),
  }
}

export function mediaListTotalPages(total: number, pageSize: number) {
  return total ? Math.ceil(total / pageSize) : 0
}

function normalizeMediaFileTypes(fileTypes?: MediaFileType[]) {
  if (fileTypes?.length) return Array.from(new Set(fileTypes))
  return undefined
}

function mediaSearchPattern(search?: string) {
  const query = search?.trim()
  return query ? `%${query.replace(/[\\%_]/g, "\\$&")}%` : undefined
}

export function buildMediaListWhere({
  userId,
  fileTypes,
  mimeType,
  projectId,
  search,
  source,
}: {
  userId: string
  fileTypes?: MediaFileType[]
  mimeType?: "image/svg+xml"
  projectId?: string | null
  search?: string
  source?: MediaSource
}) {
  const normalizedFileTypes = normalizeMediaFileTypes(fileTypes)
  const pattern = mediaSearchPattern(search)

  return and(
    eq(aiVideoMedia.userId, userId),
    normalizedFileTypes
      ? inArray(aiVideoMedia.fileType, normalizedFileTypes)
      : undefined,
    mimeType ? eq(aiVideoMedia.mimeType, mimeType) : undefined,
    mediaProjectFilter(projectId),
    source ? eq(aiVideoMedia.source, source) : undefined,
    mediaSearchFilter(pattern)
  )
}

function mediaProjectFilter(projectId?: string | null) {
  if (projectId === null) return isNull(aiVideoMedia.projectId)
  if (projectId) return eq(aiVideoMedia.projectId, projectId)
  return undefined
}

function mediaSearchFilter(pattern?: string) {
  if (!pattern) return undefined

  return or(
    sql`${aiVideoMedia.originalName} ILIKE ${pattern} ESCAPE '\\'`,
    sql`${aiVideoMedia.filename} ILIKE ${pattern} ESCAPE '\\'`,
    sql`${aiVideoMedia.altText} ILIKE ${pattern} ESCAPE '\\'`,
    sql`${aiVideoMedia.mimeType} ILIKE ${pattern} ESCAPE '\\'`
  )
}
