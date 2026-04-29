'use server'

import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships, directories, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { normalizeDirectorySearchQuery } from './directory-helpers'
import type { DirectoryStatus } from './directory-actions'

export type DirectoryListStatus = 'all' | 'published' | 'draft'
export type DirectoryListSort = 'default' | 'title' | 'modified'
export type DirectoryListDirection = 'asc' | 'desc'

interface DirectoryListCursorPayload {
  sortBy: DirectoryListSort
  sortDirection: DirectoryListDirection
  id: string
  title?: string
  updatedAt?: string
  displayOrder?: number
  createdAt?: string
}

export interface DirectorySummary {
  id: string
  site_id: string
  title: string
  slug: string
  status: DirectoryStatus
  display_order: number
  featured_image: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface DirectoryListQuery {
  siteId: string
  search?: string
  categoryId?: string
  status?: DirectoryListStatus
  sortBy?: DirectoryListSort
  sortDirection?: DirectoryListDirection
  cursor?: string | null
  limit?: number
}

export interface DirectoryListPage {
  rows: DirectorySummary[]
  categories: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]>
  totalCount: number
  statusCounts: Record<'all' | 'published' | 'draft', number>
  nextCursor: string | null
}

function encodeCursor(payload: DirectoryListCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeCursor(cursor?: string | null): DirectoryListCursorPayload | null {
  if (!cursor) return null

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as DirectoryListCursorPayload
  } catch {
    return null
  }
}

function toDirectorySummary(row: {
  id: string
  siteId: string
  title: string
  slug: string
  status: DirectoryStatus
  displayOrder: number
  featuredImage: string | null
  metaDescription: string | null
  createdAt: Date
  updatedAt: Date
}): DirectorySummary {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    slug: row.slug,
    status: row.status,
    display_order: row.displayOrder,
    featured_image: row.featuredImage,
    meta_description: row.metaDescription,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db.select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return Boolean(site)
}

function buildSearchCondition(query: string) {
  const pattern = `%${query}%`

  return or(
    sql`lower(${directories.title}) like ${pattern}`,
    sql`lower(${directories.slug}) like ${pattern}`,
    sql`lower(coalesce(${directories.metaDescription}, '')) like ${pattern}`
  )
}

function buildCursorCondition(
  cursor: DirectoryListCursorPayload | null,
  sortBy: DirectoryListSort,
  sortDirection: DirectoryListDirection
) {
  if (!cursor) return undefined

  if (sortBy === 'title') {
    const cursorTitle = cursor.title || ''
    return sortDirection === 'asc'
      ? or(
          sql`lower(${directories.title}) > ${cursorTitle}`,
          and(sql`lower(${directories.title}) = ${cursorTitle}`, sql`${directories.id} > ${cursor.id}::uuid`)
        )
      : or(
          sql`lower(${directories.title}) < ${cursorTitle}`,
          and(sql`lower(${directories.title}) = ${cursorTitle}`, sql`${directories.id} < ${cursor.id}::uuid`)
        )
  }

  if (sortBy === 'modified') {
    const cursorUpdatedAt = cursor.updatedAt || new Date(0).toISOString()
    return sortDirection === 'asc'
      ? or(
          sql`${directories.updatedAt} > ${cursorUpdatedAt}::timestamptz`,
          and(eq(directories.updatedAt, sql`${cursorUpdatedAt}::timestamptz`), sql`${directories.id} > ${cursor.id}::uuid`)
        )
      : or(
          sql`${directories.updatedAt} < ${cursorUpdatedAt}::timestamptz`,
          and(eq(directories.updatedAt, sql`${cursorUpdatedAt}::timestamptz`), sql`${directories.id} < ${cursor.id}::uuid`)
        )
  }

  const cursorCreatedAt = cursor.createdAt || new Date(0).toISOString()
  const cursorDisplayOrder = cursor.displayOrder ?? 0

  return or(
    sql`${directories.displayOrder} > ${cursorDisplayOrder}`,
    and(
      eq(directories.displayOrder, cursorDisplayOrder),
      sql`${directories.createdAt} < ${cursorCreatedAt}::timestamptz`
    ),
    and(
      eq(directories.displayOrder, cursorDisplayOrder),
      eq(directories.createdAt, sql`${cursorCreatedAt}::timestamptz`),
      sql`${directories.id} > ${cursor.id}::uuid`
    )
  )
}

function buildOrderBy(sortBy: DirectoryListSort, sortDirection: DirectoryListDirection) {
  if (sortBy === 'title') {
    return [
      sortDirection === 'asc' ? sql`lower(${directories.title}) asc` : sql`lower(${directories.title}) desc`,
      sortDirection === 'asc' ? asc(directories.id) : desc(directories.id),
    ]
  }

  if (sortBy === 'modified') {
    return [
      sortDirection === 'asc' ? asc(directories.updatedAt) : desc(directories.updatedAt),
      sortDirection === 'asc' ? asc(directories.id) : desc(directories.id),
    ]
  }

  return [
    asc(directories.displayOrder),
    desc(directories.createdAt),
    asc(directories.id),
  ]
}

function buildNextCursor(row: DirectorySummary, sortBy: DirectoryListSort, sortDirection: DirectoryListDirection): string {
  return encodeCursor({
    sortBy,
    sortDirection,
    id: row.id,
    title: sortBy === 'title' ? row.title.toLowerCase() : undefined,
    updatedAt: sortBy === 'modified' ? row.updated_at : undefined,
    displayOrder: sortBy === 'default' ? row.display_order : undefined,
    createdAt: sortBy === 'default' ? row.created_at : undefined,
  })
}

async function getCategoryMap(directoryIds: string[]) {
  if (directoryIds.length === 0) return {}

  const relationships = await db.select({
    contentId: contentCategoryRelationships.contentId,
    categoryId: categories.id,
    title: categories.title,
    slug: categories.slug,
    parentId: categories.parentId,
  })
    .from(contentCategoryRelationships)
    .innerJoin(categories, eq(contentCategoryRelationships.categoryId, categories.id))
    .where(
      and(
        inArray(contentCategoryRelationships.contentId, directoryIds),
        eq(contentCategoryRelationships.contentType, 'directory')
      )
    )

  if (relationships.length === 0) return {}

  const parentIds = Array.from(new Set(relationships.map((row) => row.parentId).filter(Boolean))) as string[]
  const parentTitles = new Map<string, string>()

  if (parentIds.length > 0) {
    const parentRows = await db.select({ id: categories.id, title: categories.title })
      .from(categories)
      .where(inArray(categories.id, parentIds))

    for (const parent of parentRows) {
      parentTitles.set(parent.id, parent.title)
    }
  }

  return relationships.reduce<Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]>>((acc, row) => {
    if (!acc[row.contentId]) acc[row.contentId] = []

    acc[row.contentId].push({
      id: row.categoryId,
      title: row.title,
      slug: row.slug,
      parent_id: row.parentId,
      parent_title: row.parentId ? parentTitles.get(row.parentId) : undefined,
    })

    return acc
  }, {})
}

export async function getDirectoryListPageAction(query: DirectoryListQuery): Promise<{
  data: DirectoryListPage | null
  error: string | null
}> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const ownsSite = await verifySiteOwnership(query.siteId, user.id)
    if (!ownsSite) return { data: null, error: 'Site not found or unauthorized' }

    const sortBy = query.sortBy || 'default'
    const sortDirection = query.sortDirection || (sortBy === 'modified' ? 'desc' : 'asc')
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 50)))
    const cursor = decodeCursor(query.cursor)
    const normalizedSearch = normalizeDirectorySearchQuery(query.search)

    const baseConditions = [eq(directories.siteId, query.siteId)]

    if (normalizedSearch) {
      const searchCondition = buildSearchCondition(normalizedSearch)
      if (searchCondition) {
        baseConditions.push(searchCondition)
      }
    }

    if (query.categoryId) {
      const directoryIdsForCategory = await db.select({ contentId: contentCategoryRelationships.contentId })
        .from(contentCategoryRelationships)
        .where(
          and(
            eq(contentCategoryRelationships.categoryId, query.categoryId),
            eq(contentCategoryRelationships.contentType, 'directory')
          )
        )

      if (directoryIdsForCategory.length === 0) {
        return {
          data: {
            rows: [],
            categories: {},
            totalCount: 0,
            statusCounts: { all: 0, published: 0, draft: 0 },
            nextCursor: null,
          },
          error: null,
        }
      }

      baseConditions.push(inArray(directories.id, directoryIdsForCategory.map((row) => row.contentId)))
    }

    const filteredConditions = [...baseConditions]

    if (query.status === 'published') filteredConditions.push(eq(directories.status, 'published'))
    if (query.status === 'draft') filteredConditions.push(eq(directories.status, 'draft'))

    const cursorCondition = buildCursorCondition(cursor, sortBy, sortDirection)
    if (cursorCondition) filteredConditions.push(cursorCondition)

    const rows = await db.select({
      id: directories.id,
      siteId: directories.siteId,
      title: directories.title,
      slug: directories.slug,
      status: directories.status,
      displayOrder: directories.displayOrder,
      featuredImage: directories.featuredImage,
      metaDescription: directories.metaDescription,
      createdAt: directories.createdAt,
      updatedAt: directories.updatedAt,
    })
      .from(directories)
      .where(and(...filteredConditions))
      .orderBy(...buildOrderBy(sortBy, sortDirection))
      .limit(limit + 1)

    const summaryRows = rows.slice(0, limit).map(toDirectorySummary)
    const categoriesByDirectory = await getCategoryMap(summaryRows.map((row) => row.id))

    const [totalResult, countsResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(directories)
        .where(and(...baseConditions, ...(query.status === 'published' ? [eq(directories.status, 'published')] : []), ...(query.status === 'draft' ? [eq(directories.status, 'draft')] : []))),
      db.select({
        all: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${directories.status} = 'published')::int`,
        draft: sql<number>`count(*) filter (where ${directories.status} = 'draft')::int`,
      })
        .from(directories)
        .where(and(...baseConditions)),
    ])

    return {
      data: {
        rows: summaryRows,
        categories: categoriesByDirectory,
        totalCount: totalResult[0]?.count ?? 0,
        statusCounts: {
          all: countsResult[0]?.all ?? 0,
          published: countsResult[0]?.published ?? 0,
          draft: countsResult[0]?.draft ?? 0,
        },
        nextCursor: rows.length > limit && summaryRows.length > 0
          ? buildNextCursor(summaryRows[summaryRows.length - 1], sortBy, sortDirection)
          : null,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error loading directory list page:', error)
    return { data: null, error: 'Failed to load directories' }
  }
}

export async function searchSiteDirectoriesAction(siteId: string, options?: {
  search?: string
  limit?: number
}): Promise<{
  data: DirectorySummary[] | null
  error: string | null
}> {
  const result = await getDirectoryListPageAction({
    siteId,
    search: options?.search,
    limit: options?.limit ?? 20,
    sortBy: options?.search ? 'title' : 'default',
    sortDirection: 'asc',
  })

  return {
    data: result.data?.rows ?? null,
    error: result.error,
  }
}
