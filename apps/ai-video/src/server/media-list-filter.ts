import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"

import { aiVideoMedia, aiVideoMediaCollectionItems } from "./schema.ts"

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
  collectionId,
  fileTypes,
  mimeType,
  projectId,
  proxyStatus,
  search,
  source,
}: {
  userId: string
  collectionId?: string | null
  fileTypes?: MediaFileType[]
  mimeType?: "image/svg+xml"
  projectId?: string | null
  proxyStatus?: "ready"
  search?: string
  source?: MediaSource
}) {
  const normalizedFileTypes = normalizeMediaFileTypes(fileTypes)
  const pattern = mediaSearchPattern(search)

  return and(
    eq(aiVideoMedia.userId, userId),
    mediaCollectionFilter(collectionId),
    normalizedFileTypes
      ? inArray(aiVideoMedia.fileType, normalizedFileTypes)
      : undefined,
    mimeType ? eq(aiVideoMedia.mimeType, mimeType) : undefined,
    mediaProjectFilter(projectId),
    proxyStatus ? eq(aiVideoMedia.proxyStatus, proxyStatus) : undefined,
    source ? eq(aiVideoMedia.source, source) : undefined,
    mediaSearchFilter(pattern)
  )
}

function mediaProjectFilter(projectId?: string | null) {
  if (projectId === null) return isNull(aiVideoMedia.projectId)
  if (projectId) return eq(aiVideoMedia.projectId, projectId)
  return undefined
}

// Membership is a join table, so both "in this collection" and "in no
// collection at all" are EXISTS checks against it rather than a column test.
// `collectionId` is bound as a parameter, and the caller has already proved it
// owns that collection.
function mediaCollectionFilter(collectionId?: string | null) {
  if (collectionId === undefined) return undefined

  if (collectionId === null) {
    return sql`not exists (select 1 from ${aiVideoMediaCollectionItems}
      where ${aiVideoMediaCollectionItems.mediaId} = ${aiVideoMedia.id})`
  }

  return sql`exists (select 1 from ${aiVideoMediaCollectionItems}
    where ${aiVideoMediaCollectionItems.mediaId} = ${aiVideoMedia.id}
      and ${aiVideoMediaCollectionItems.collectionId} = ${collectionId})`
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
