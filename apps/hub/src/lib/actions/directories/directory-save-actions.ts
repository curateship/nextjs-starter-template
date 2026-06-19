'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { getPublicAuthPagePath } from '@/lib/actions/pages/page-frontend-actions'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { authUsers, directories, directorySaveCollections, directorySaveItems, siteMemberships, sites } from '@/lib/db/schema'
import { touchSiteMembershipActivity } from '@/lib/utils/site-membership-runtime'
import { UUID_REGEX } from '@/lib/utils/validation'

export interface DirectorySaveCollectionState {
  id: string | null
  name: string
  default_key: string | null
  saved: boolean
}

export type DirectorySaveFolderTypeFilter = 'all' | 'default' | 'custom'

export interface DirectorySaveDefaultCollectionLabel {
  key: string
  label: string
}

export interface DirectorySaveDashboardFolder {
  id: string
  owner_name: string
  owner_email: string
  name: string
  default_key: string | null
  item_count: number
  created_at: string
  updated_at: string
  last_saved_at: string | null
}

export interface DirectorySaveDashboardItem {
  id: string
  directory_title: string
  directory_slug: string
  directory_featured_image: string | null
  directory_status: string
  saved_at: string
}

export interface DirectorySaveDashboardCollection {
  id: string
  name: string
  default_key: string | null
}

const DEFAULT_COLLECTIONS = [
  { key: 'saved', label: 'Saved' },
  { key: 'want_to_go', label: 'Want to go' },
]

function sanitizeFolderName(value: unknown) {
  return typeof value === 'string'
    ? value.trim().replace(/[<>"]/g, '').slice(0, 80)
    : ''
}

function toIso(value?: Date | string | null) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function toNullableIso(value?: Date | string | null) {
  return value ? toIso(value) : null
}

function getDefaultCollections(settings: unknown) {
  const configured = (settings && typeof settings === 'object' && Array.isArray((settings as any).directory_save_default_collections))
    ? (settings as any).directory_save_default_collections
    : []

  return DEFAULT_COLLECTIONS.map((fallback) => {
    const match = configured.find((item: any) => item?.key === fallback.key)
    const label = sanitizeFolderName(match?.label) || fallback.label
    return { key: fallback.key, label }
  })
}

function getDefaultCollectionMap(settings: unknown) {
  return new Map(getDefaultCollections(settings).map((item) => [item.key, item.label]))
}

function normalizePageOptions(options?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Math.floor(options?.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function revalidateDirectorySaves(siteId: string) {
  revalidateTag('listing-views')
  revalidateTag(`site-${siteId}`)
  revalidatePath('/admin/directory/saved')
}

async function ensureDirectorySaveAdmin(siteId: string) {
  if (!UUID_REGEX.test(siteId)) {
    return { site: null, error: 'Invalid site ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { site: null, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { site: null, error: 'Access denied' }

  const [site] = await db
    .select({
      id: sites.id,
      settings: sites.settings,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1)

  if (!site) return { site: null, error: 'Site not found' }

  return { site, error: null }
}

function buildFolderDashboardWhere(input: {
  siteId: string
  query?: string
  type?: DirectorySaveFolderTypeFilter
}) {
  const filters = [eq(directorySaveCollections.siteId, input.siteId)]
  const type = input.type || 'all'
  const query = input.query?.trim().toLowerCase() || ''

  if (type === 'default') {
    filters.push(sql`${directorySaveCollections.defaultKey} is not null`)
  } else if (type === 'custom') {
    filters.push(isNull(directorySaveCollections.defaultKey))
  }

  if (query) {
    const likeQuery = `%${query}%`
    filters.push(sql`(
      lower(${directorySaveCollections.name}) like ${likeQuery}
      or lower(coalesce(${directorySaveCollections.defaultKey}, '')) like ${likeQuery}
      or lower(coalesce(${authUsers.name}, '')) like ${likeQuery}
      or lower(coalesce(${authUsers.displayName}, '')) like ${likeQuery}
      or lower(coalesce(${authUsers.email}, '')) like ${likeQuery}
    )`)
  }

  return and(...filters)
}

function buildFolderItemDashboardWhere(input: {
  siteId: string
  collectionId: string
  query?: string
}) {
  const filters = [
    eq(directorySaveItems.siteId, input.siteId),
    eq(directorySaveItems.collectionId, input.collectionId),
    eq(directories.siteId, input.siteId),
  ]
  const query = input.query?.trim().toLowerCase() || ''

  if (query) {
    const likeQuery = `%${query}%`
    filters.push(sql`(
      lower(${directories.title}) like ${likeQuery}
      or lower(${directories.slug}) like ${likeQuery}
    )`)
  }

  return and(...filters)
}

async function getDirectoryAndSite(siteId: string, directoryId: string, userId: string) {
  const [row] = await db
    .select({
      site: {
        id: sites.id,
        settings: sites.settings,
      },
      directory: {
        id: directories.id,
      },
      membershipId: siteMemberships.id,
    })
    .from(directories)
    .innerJoin(sites, eq(sites.id, directories.siteId))
    .leftJoin(siteMemberships, and(
      eq(siteMemberships.siteId, sites.id),
      eq(siteMemberships.userId, userId),
      eq(siteMemberships.status, 'active')
    ))
    .where(and(
      eq(sites.id, siteId),
      eq(directories.id, directoryId),
      eq(directories.status, 'published')
    ))
    .limit(1)

  return row || null
}

async function ensureSaveAccess(siteId: string, directoryId: string) {
  if (!UUID_REGEX.test(siteId) || !UUID_REGEX.test(directoryId)) {
    return { user: null, row: null, authPath: null, error: 'Invalid listing ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    const authPathResult = await getPublicAuthPagePath(siteId)
    return { user: null, row: null, authPath: authPathResult.path || '/', error: null }
  }

  const row = await getDirectoryAndSite(siteId, directoryId, user.id)
  if (!row) return { user: null, row: null, authPath: null, error: 'Listing not found' }
  if (!row.membershipId) {
    return { user: null, row, authPath: null, error: 'Membership required' }
  }

  return { user, row, authPath: null, error: null }
}

async function buildState(siteId: string, userId: string, directoryId: string, settings: unknown) {
  const collectionRows = await db
    .select({
      id: directorySaveCollections.id,
      name: directorySaveCollections.name,
      defaultKey: directorySaveCollections.defaultKey,
      createdAt: directorySaveCollections.createdAt,
      savedItemId: directorySaveItems.id,
    })
    .from(directorySaveCollections)
    .leftJoin(directorySaveItems, and(
      eq(directorySaveItems.siteId, siteId),
      eq(directorySaveItems.userId, userId),
      eq(directorySaveItems.directoryId, directoryId),
      eq(directorySaveItems.collectionId, directorySaveCollections.id)
    ))
    .where(and(
      eq(directorySaveCollections.siteId, siteId),
      eq(directorySaveCollections.userId, userId)
    ))
    .orderBy(sql`${directorySaveCollections.defaultKey} asc nulls last`, asc(directorySaveCollections.createdAt), asc(directorySaveCollections.id))
  const rowsByDefaultKey = new Map(collectionRows.map((row) => [row.defaultKey, row]))
  const defaultCollections = getDefaultCollections(settings).map((item) => {
    const row = rowsByDefaultKey.get(item.key)
    return {
      id: row?.id || null,
      name: item.label,
      default_key: item.key,
      saved: Boolean(row?.savedItemId),
    }
  })
  const customCollections = collectionRows
    .filter((row) => !row.defaultKey)
    .map((row) => ({
      id: row.id,
      name: row.name,
      default_key: null,
      saved: Boolean(row.savedItemId),
    }))

  return [...defaultCollections, ...customCollections]
}

async function getOrCreateDefaultCollection(siteId: string, userId: string, defaultKey: string, settings: unknown) {
  const defaultCollection = getDefaultCollections(settings).find((item) => item.key === defaultKey)
  if (!defaultCollection) return null

  const [existing] = await db
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(and(
      eq(directorySaveCollections.siteId, siteId),
      eq(directorySaveCollections.userId, userId),
      eq(directorySaveCollections.defaultKey, defaultKey)
    ))
    .limit(1)

  if (existing) return existing.id

  const [created] = await db
    .insert(directorySaveCollections)
    .values({
      siteId,
      userId,
      name: defaultCollection.label,
      defaultKey,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: directorySaveCollections.id })

  if (created?.id) return created.id

  const [afterConflict] = await db
    .select({ id: directorySaveCollections.id })
    .from(directorySaveCollections)
    .where(and(
      eq(directorySaveCollections.siteId, siteId),
      eq(directorySaveCollections.userId, userId),
      eq(directorySaveCollections.defaultKey, defaultKey)
    ))
    .limit(1)

  return afterConflict?.id || null
}

export async function getDirectorySaveStateAction(input: {
  siteId: string
  directoryId: string
}): Promise<{
  authenticated: boolean
  authPath: string | null
  collections: DirectorySaveCollectionState[]
  error: string | null
}> {
  try {
    const access = await ensureSaveAccess(input.siteId, input.directoryId)
    if (access.error) return { authenticated: Boolean(access.user), authPath: null, collections: [], error: access.error }
    if (!access.user || !access.row) return { authenticated: false, authPath: access.authPath || '/', collections: [], error: null }

    const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
    return { authenticated: true, authPath: null, collections, error: null }
  } catch (error) {
    console.error('Failed to load directory save folders:', error)
    return { authenticated: true, authPath: null, collections: [], error: 'Save folders are unavailable' }
  }
}

export async function toggleDirectorySaveCollectionAction(input: {
  siteId: string
  directoryId: string
  collectionId?: string | null
  defaultKey?: string | null
  saved: boolean
}): Promise<{
  authenticated: boolean
  authPath: string | null
  collections: DirectorySaveCollectionState[]
  error: string | null
}> {
  try {
    const access = await ensureSaveAccess(input.siteId, input.directoryId)
    if (access.error) return { authenticated: Boolean(access.user), authPath: null, collections: [], error: access.error }
    if (!access.user || !access.row) return { authenticated: false, authPath: access.authPath || '/', collections: [], error: null }

    let collectionId = input.collectionId && UUID_REGEX.test(input.collectionId) ? input.collectionId : null
    const defaultKey = typeof input.defaultKey === 'string' ? input.defaultKey.trim() : ''

    if (!collectionId && defaultKey && !input.saved) {
      const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
      return { authenticated: true, authPath: null, collections, error: null }
    }

    if (!collectionId && defaultKey) {
      collectionId = await getOrCreateDefaultCollection(input.siteId, access.user.id, defaultKey, access.row.site.settings)
    }

    if (!collectionId) {
      return { authenticated: true, authPath: null, collections: [], error: 'Folder not found' }
    }

    const [collection] = await db
      .select({ id: directorySaveCollections.id })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.id, collectionId),
        eq(directorySaveCollections.siteId, input.siteId),
        eq(directorySaveCollections.userId, access.user.id)
      ))
      .limit(1)

    if (!collection) {
      return { authenticated: true, authPath: null, collections: [], error: 'Folder not found' }
    }

    if (input.saved) {
      await db
        .insert(directorySaveItems)
        .values({
          siteId: input.siteId,
          userId: access.user.id,
          collectionId,
          directoryId: input.directoryId,
        })
        .onConflictDoNothing()
    } else {
      await db
        .delete(directorySaveItems)
        .where(and(
          eq(directorySaveItems.siteId, input.siteId),
          eq(directorySaveItems.userId, access.user.id),
          eq(directorySaveItems.collectionId, collectionId),
          eq(directorySaveItems.directoryId, input.directoryId)
        ))
    }

    await touchSiteMembershipActivity(input.siteId, access.user.id)
    revalidateDirectorySaves(input.siteId)

    const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
    return { authenticated: true, authPath: null, collections, error: null }
  } catch (error) {
    console.error('Failed to update directory save folders:', error)
    return { authenticated: true, authPath: null, collections: [], error: 'Save folders are unavailable' }
  }
}

export async function createDirectorySaveCollectionAction(input: {
  siteId: string
  directoryId: string
  name: string
}): Promise<{
  authenticated: boolean
  authPath: string | null
  collections: DirectorySaveCollectionState[]
  error: string | null
}> {
  try {
    const access = await ensureSaveAccess(input.siteId, input.directoryId)
    if (access.error) return { authenticated: Boolean(access.user), authPath: null, collections: [], error: access.error }
    if (!access.user || !access.row) return { authenticated: false, authPath: access.authPath || '/', collections: [], error: null }

    const name = sanitizeFolderName(input.name)
    if (!name) {
      const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
      return { authenticated: true, authPath: null, collections, error: 'Enter a folder name' }
    }

    const [existing] = await db
      .select({ id: directorySaveCollections.id })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.siteId, input.siteId),
        eq(directorySaveCollections.userId, access.user.id),
        isNull(directorySaveCollections.defaultKey),
        sql`lower(${directorySaveCollections.name}) = ${name.toLowerCase()}`
      ))
      .limit(1)

    if (existing) {
      const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
      return { authenticated: true, authPath: null, collections, error: 'Folder already exists' }
    }

    const [collection] = await db
      .insert(directorySaveCollections)
      .values({
        siteId: input.siteId,
        userId: access.user.id,
        name,
        defaultKey: null,
        updatedAt: new Date(),
      })
      .returning({ id: directorySaveCollections.id })

    if (collection) {
      await db
        .insert(directorySaveItems)
        .values({
          siteId: input.siteId,
          userId: access.user.id,
          collectionId: collection.id,
          directoryId: input.directoryId,
        })
        .onConflictDoNothing()
    }

    await touchSiteMembershipActivity(input.siteId, access.user.id)
    revalidateDirectorySaves(input.siteId)

    const collections = await buildState(input.siteId, access.user.id, input.directoryId, access.row.site.settings)
    return { authenticated: true, authPath: null, collections, error: null }
  } catch (error) {
    console.error('Failed to create directory save folder:', error)
    return { authenticated: true, authPath: null, collections: [], error: 'Save folders are unavailable' }
  }
}

export interface MySavedListingItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
  meta_description: string | null
  rating: number | null
  address: string | null
  saved_at: string
}

// Same address cleanup the listing-views data layer applies (strip country +
// postal codes) so saved cards match the Listing Views block exactly
function formatSavedListingAddress(address?: string | null) {
  const parts = (address || '').split(',').map((part) => part.trim()).filter(Boolean)
  const countryNames = ['united states', 'usa', 'us', 'canada', 'ca']

  return parts
    .filter((part, index) => index !== parts.length - 1 || !countryNames.includes(part.toLowerCase()))
    .map((part) => part
      .replace(/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/gi, '')
      .replace(/\b\d{5}(?:-\d{4})?\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    )
    .filter(Boolean)
    .join(', ')
}

export interface MySavedCollection {
  id: string | null
  name: string
  default_key: string | null
  items: MySavedListingItem[]
}

// Caps how many saved listings each folder returns to the account Core block
const MY_SAVED_ITEMS_PER_FOLDER = 50

// Current user's save folders with their saved (published) listings — powers
// the account Core block tabs. Per-user data: never wrapped in unstable_cache.
export async function getMySavedCollectionsAction(siteId: string): Promise<{
  collections: MySavedCollection[]
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(siteId)) {
      return { collections: [], error: 'Invalid site ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { collections: [], error: null }

    const [site] = await db
      .select({ settings: sites.settings })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site) return { collections: [], error: 'Site not found' }

    const [collectionRows, itemRows] = await Promise.all([
      db
        .select({
          id: directorySaveCollections.id,
          name: directorySaveCollections.name,
          defaultKey: directorySaveCollections.defaultKey,
        })
        .from(directorySaveCollections)
        .where(and(
          eq(directorySaveCollections.siteId, siteId),
          eq(directorySaveCollections.userId, user.id)
        ))
        .orderBy(sql`${directorySaveCollections.defaultKey} asc nulls last`, asc(directorySaveCollections.createdAt), asc(directorySaveCollections.id)),
      // Raw SQL for the lateral directory-core extraction (rating/address live
      // inside the listing's content blocks) — mirrors getListingViewsData
      db.execute<{
        collection_id: string
        directory_id: string
        title: string
        slug: string
        featured_image: string | null
        meta_description: string | null
        rating: string | null
        address: string | null
        saved_at: Date
      }>(sql`
        select
          dsi.collection_id,
          d.id as directory_id,
          d.title,
          d.slug,
          d.featured_image,
          d.meta_description,
          case
            when core_block.content #>> '{rating}' ~ '^[0-9]+(\\.[0-9]+)?$'
            then core_block.content #>> '{rating}'
            else null
          end as rating,
          nullif(core_block.content #>> '{address}', '') as address,
          dsi.created_at as saved_at
        from directory_save_items dsi
        inner join directory d on d.id = dsi.directory_id
        left join lateral (
          select block.value->'content' as content
          from jsonb_each(coalesce(d.content_blocks, '{}'::jsonb)) as block(key, value)
          where block.value->>'type' = 'directory-core'
          limit 1
        ) core_block on true
        where dsi.site_id = ${siteId}
          and dsi.user_id = ${user.id}
          and d.status = 'published'
        order by dsi.created_at desc, dsi.id desc
      `),
    ])

    // Group saved items under their folder, capped per folder
    const itemsByCollection = new Map<string, MySavedListingItem[]>()
    for (const row of itemRows.rows) {
      const list = itemsByCollection.get(row.collection_id) || []
      if (list.length >= MY_SAVED_ITEMS_PER_FOLDER) continue
      list.push({
        id: row.directory_id,
        title: row.title,
        slug: row.slug,
        featured_image: row.featured_image,
        meta_description: row.meta_description,
        rating: row.rating == null ? null : Number(row.rating),
        address: formatSavedListingAddress(row.address) || null,
        saved_at: toIso(row.saved_at),
      })
      itemsByCollection.set(row.collection_id, list)
    }

    // Default folders always appear (labels from site settings), even before
    // the user's row exists; custom folders follow in creation order
    const rowsByDefaultKey = new Map(collectionRows.map((row) => [row.defaultKey, row]))
    const defaultCollections = getDefaultCollections(site.settings).map((item) => {
      const row = rowsByDefaultKey.get(item.key)
      return {
        id: row?.id || null,
        name: item.label,
        default_key: item.key,
        items: row ? (itemsByCollection.get(row.id) || []) : [],
      }
    })
    const customCollections = collectionRows
      .filter((row) => !row.defaultKey)
      .map((row) => ({
        id: row.id as string | null,
        name: row.name,
        default_key: null,
        items: itemsByCollection.get(row.id) || [],
      }))

    return { collections: [...defaultCollections, ...customCollections], error: null }
  } catch (error) {
    console.error('Failed to load saved listings:', error)
    return { collections: [], error: 'Saved listings are unavailable' }
  }
}

export async function getDirectorySaveFoldersDashboardAction(input: {
  siteId: string
  page?: number
  pageSize?: number
  query?: string
  type?: DirectorySaveFolderTypeFilter
}): Promise<{
  data: DirectorySaveDashboardFolder[]
  total: number
  defaults: DirectorySaveDefaultCollectionLabel[]
  error: string | null
}> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) {
      return { data: [], total: 0, defaults: [], error: access.error || 'Access denied' }
    }

    const { pageSize, offset } = normalizePageOptions(input)
    const where = buildFolderDashboardWhere({
      siteId: input.siteId,
      query: input.query,
      type: input.type,
    })
    const defaultLabelMap = getDefaultCollectionMap(access.site.settings)
    const itemCountSql = sql<number>`(
      select count(*)::int
      from ${directorySaveItems}
      where ${directorySaveItems.collectionId} = ${directorySaveCollections.id}
    )`
    const lastSavedAtSql = sql<Date | null>`(
      select max(${directorySaveItems.createdAt})
      from ${directorySaveItems}
      where ${directorySaveItems.collectionId} = ${directorySaveCollections.id}
    )`

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: directorySaveCollections.id,
          name: directorySaveCollections.name,
          defaultKey: directorySaveCollections.defaultKey,
          createdAt: directorySaveCollections.createdAt,
          updatedAt: directorySaveCollections.updatedAt,
          ownerName: authUsers.name,
          ownerDisplayName: authUsers.displayName,
          ownerEmail: authUsers.email,
          itemCount: itemCountSql,
          lastSavedAt: lastSavedAtSql,
        })
        .from(directorySaveCollections)
        .innerJoin(authUsers, eq(authUsers.id, directorySaveCollections.userId))
        .where(where)
        .orderBy(desc(directorySaveCollections.updatedAt), desc(directorySaveCollections.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(directorySaveCollections)
        .innerJoin(authUsers, eq(authUsers.id, directorySaveCollections.userId))
        .where(where),
    ])

    return {
      data: rows.map((row) => ({
        id: row.id,
        owner_name: row.ownerDisplayName || row.ownerName || row.ownerEmail,
        owner_email: row.ownerEmail,
        name: row.defaultKey ? (defaultLabelMap.get(row.defaultKey) || row.name) : row.name,
        default_key: row.defaultKey,
        item_count: Number(row.itemCount || 0),
        created_at: toIso(row.createdAt),
        updated_at: toIso(row.updatedAt),
        last_saved_at: toNullableIso(row.lastSavedAt),
      })),
      total: Number(countRows[0]?.count || 0),
      defaults: getDefaultCollections(access.site.settings),
      error: null,
    }
  } catch (error) {
    console.error('Failed to load directory save dashboard folders:', error)
    return { data: [], total: 0, defaults: [], error: 'Failed to load saved folders' }
  }
}

export async function getDirectorySaveFolderItemsDashboardAction(input: {
  siteId: string
  collectionId: string
  page?: number
  pageSize?: number
  query?: string
}): Promise<{
  collection: DirectorySaveDashboardCollection | null
  data: DirectorySaveDashboardItem[]
  total: number
  error: string | null
}> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) {
      return { collection: null, data: [], total: 0, error: access.error || 'Access denied' }
    }
    if (!UUID_REGEX.test(input.collectionId)) {
      return { collection: null, data: [], total: 0, error: 'Invalid folder ID' }
    }

    const [collectionRow] = await db
      .select({
        id: directorySaveCollections.id,
        name: directorySaveCollections.name,
        defaultKey: directorySaveCollections.defaultKey,
      })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.id, input.collectionId),
        eq(directorySaveCollections.siteId, input.siteId)
      ))
      .limit(1)

    if (!collectionRow) {
      return { collection: null, data: [], total: 0, error: 'Folder not found' }
    }

    const { pageSize, offset } = normalizePageOptions(input)
    const where = buildFolderItemDashboardWhere(input)
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: directorySaveItems.id,
          directoryTitle: directories.title,
          directorySlug: directories.slug,
          directoryFeaturedImage: directories.featuredImage,
          directoryStatus: directories.status,
          savedAt: directorySaveItems.createdAt,
        })
        .from(directorySaveItems)
        .innerJoin(directories, eq(directories.id, directorySaveItems.directoryId))
        .where(where)
        .orderBy(desc(directorySaveItems.createdAt), desc(directorySaveItems.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(directorySaveItems)
        .innerJoin(directories, eq(directories.id, directorySaveItems.directoryId))
        .where(where),
    ])

    const defaultLabelMap = getDefaultCollectionMap(access.site.settings)
    const collection: DirectorySaveDashboardCollection = {
      id: collectionRow.id,
      name: collectionRow.defaultKey ? (defaultLabelMap.get(collectionRow.defaultKey) || collectionRow.name) : collectionRow.name,
      default_key: collectionRow.defaultKey,
    }

    return {
      collection,
      data: rows.map((row) => ({
        id: row.id,
        directory_title: row.directoryTitle,
        directory_slug: row.directorySlug,
        directory_featured_image: row.directoryFeaturedImage,
        directory_status: row.directoryStatus,
        saved_at: toIso(row.savedAt),
      })),
      total: Number(countRows[0]?.count || 0),
      error: null,
    }
  } catch (error) {
    console.error('Failed to load directory save folder items:', error)
    return { collection: null, data: [], total: 0, error: 'Failed to load saved listings' }
  }
}

export async function updateDirectorySaveDefaultCollectionsAction(input: {
  siteId: string
  savedLabel: string
  wantToGoLabel: string
}): Promise<{
  defaults: DirectorySaveDefaultCollectionLabel[]
  error: string | null
}> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) {
      return { defaults: [], error: access.error || 'Access denied' }
    }

    const defaults = [
      { key: 'saved', label: sanitizeFolderName(input.savedLabel) || 'Saved' },
      { key: 'want_to_go', label: sanitizeFolderName(input.wantToGoLabel) || 'Want to go' },
    ]
    const settings = {
      ...((access.site.settings && typeof access.site.settings === 'object') ? access.site.settings as Record<string, any> : {}),
      directory_save_default_collections: defaults,
    }
    const now = new Date()

    await db.transaction(async (tx) => {
      await tx
        .update(sites)
        .set({ settings, updatedAt: now })
        .where(eq(sites.id, input.siteId))

      for (const item of defaults) {
        await tx
          .update(directorySaveCollections)
          .set({ name: item.label, updatedAt: now })
          .where(and(
            eq(directorySaveCollections.siteId, input.siteId),
            eq(directorySaveCollections.defaultKey, item.key)
          ))
      }
    })

    revalidateDirectorySaves(input.siteId)

    return { defaults, error: null }
  } catch (error) {
    console.error('Failed to update directory save defaults:', error)
    return { defaults: [], error: 'Failed to save default folders' }
  }
}

export async function renameDirectorySaveCollectionDashboardAction(input: {
  siteId: string
  collectionId: string
  name: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) return { success: false, error: access.error || 'Access denied' }
    if (!UUID_REGEX.test(input.collectionId)) return { success: false, error: 'Invalid folder ID' }

    const name = sanitizeFolderName(input.name)
    if (!name) return { success: false, error: 'Enter a folder name' }

    const [collection] = await db
      .select({
        id: directorySaveCollections.id,
        userId: directorySaveCollections.userId,
        defaultKey: directorySaveCollections.defaultKey,
      })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.id, input.collectionId),
        eq(directorySaveCollections.siteId, input.siteId)
      ))
      .limit(1)

    if (!collection) return { success: false, error: 'Folder not found' }
    if (collection.defaultKey) return { success: false, error: 'Rename default folders from Default Folders' }

    const [existing] = await db
      .select({ id: directorySaveCollections.id })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.siteId, input.siteId),
        eq(directorySaveCollections.userId, collection.userId),
        isNull(directorySaveCollections.defaultKey),
        ne(directorySaveCollections.id, input.collectionId),
        sql`lower(${directorySaveCollections.name}) = ${name.toLowerCase()}`
      ))
      .limit(1)

    if (existing) return { success: false, error: 'Folder already exists for this user' }

    await db
      .update(directorySaveCollections)
      .set({ name, updatedAt: new Date() })
      .where(and(
        eq(directorySaveCollections.id, input.collectionId),
        eq(directorySaveCollections.siteId, input.siteId)
      ))

    revalidateDirectorySaves(input.siteId)

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to rename directory save folder:', error)
    return { success: false, error: 'Failed to rename folder' }
  }
}

export async function removeDirectorySaveCollectionsDashboardAction(input: {
  siteId: string
  collectionIds: string[]
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) return { success: false, error: access.error || 'Access denied' }

    const collectionIds = Array.from(new Set(input.collectionIds.filter((id) => UUID_REGEX.test(id)))).slice(0, 100)
    if (!collectionIds.length) return { success: false, error: 'Select at least one folder' }

    const rows = await db
      .select({
        id: directorySaveCollections.id,
        defaultKey: directorySaveCollections.defaultKey,
      })
      .from(directorySaveCollections)
      .where(and(
        eq(directorySaveCollections.siteId, input.siteId),
        inArray(directorySaveCollections.id, collectionIds)
      ))

    if (!rows.length) return { success: false, error: 'Folder not found' }

    const defaultIds = rows.filter((row) => row.defaultKey).map((row) => row.id)
    const customIds = rows.filter((row) => !row.defaultKey).map((row) => row.id)
    const now = new Date()

    await db.transaction(async (tx) => {
      if (defaultIds.length) {
        await tx
          .delete(directorySaveItems)
          .where(and(
            eq(directorySaveItems.siteId, input.siteId),
            inArray(directorySaveItems.collectionId, defaultIds)
          ))
        await tx
          .update(directorySaveCollections)
          .set({ updatedAt: now })
          .where(and(
            eq(directorySaveCollections.siteId, input.siteId),
            inArray(directorySaveCollections.id, defaultIds)
          ))
      }

      if (customIds.length) {
        await tx
          .delete(directorySaveCollections)
          .where(and(
            eq(directorySaveCollections.siteId, input.siteId),
            inArray(directorySaveCollections.id, customIds)
          ))
      }
    })

    revalidateDirectorySaves(input.siteId)

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to remove directory save folders:', error)
    return { success: false, error: 'Failed to remove folders' }
  }
}

export async function removeDirectorySaveItemsDashboardAction(input: {
  siteId: string
  itemIds: string[]
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const access = await ensureDirectorySaveAdmin(input.siteId)
    if (access.error || !access.site) return { success: false, error: access.error || 'Access denied' }

    const itemIds = Array.from(new Set(input.itemIds.filter((id) => UUID_REGEX.test(id)))).slice(0, 100)
    if (!itemIds.length) return { success: false, error: 'Select at least one saved listing' }

    await db
      .delete(directorySaveItems)
      .where(and(
        eq(directorySaveItems.siteId, input.siteId),
        inArray(directorySaveItems.id, itemIds)
      ))

    revalidateDirectorySaves(input.siteId)

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to remove directory save items:', error)
    return { success: false, error: 'Failed to remove saved listings' }
  }
}
