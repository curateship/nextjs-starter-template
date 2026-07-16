
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  authUsers,
  categories,
  directories,
  events,
  pages,
  posts,
  products,
  siteMemberships,
  sites,
} from '@/lib/db/schema'
import { UUID_REGEX } from '@/lib/utils/validation'
import {
  isSiteSearchContentPrivate,
  type SiteSearchSourceType,
} from '@/lib/site-search/types'
import {
  isValidPublicProfileUsername,
  toPublicProfileUsername,
} from '@/lib/utils/public-profile-path'

type SearchableRow = Record<string, any>

const profileSearchSelect = {
  id: authUsers.id,
  siteId: siteMemberships.siteId,
  name: authUsers.name,
  displayName: authUsers.displayName,
  image: authUsers.image,
  bio: authUsers.bio,
  status: siteMemberships.status,
  banned: authUsers.banned,
}

const PRIVATE_TEXT_KEYS = new Set([
  'email',
  'user_id',
  'userid',
  'membership_id',
  'membershipid',
  'password',
  'secret',
  'token',
  'stripe',
  'customer',
])

const PUBLIC_TEXT_KEYS = new Set([
  'title',
  'subtitle',
  'heading',
  'subheading',
  'body',
  'content',
  'text',
  'description',
  'summary',
  'excerpt',
  'question',
  'answer',
  'name',
  'role',
  'label',
  'address',
  'city',
  'state',
  'country',
  'intro',
  'richtext',
  'rich_text',
])

function cleanText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value
  return `${value.slice(0, length).trim()}...`
}

function shouldSkipKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '')
  return [...PRIVATE_TEXT_KEYS].some((privateKey) => normalized.includes(privateKey))
}

function isPublicTextKey(key: string) {
  return PUBLIC_TEXT_KEYS.has(key.toLowerCase().replace(/[^a-z0-9_]/g, ''))
}

function extractPublicText(value: unknown, parentAllowsText = false, key = '', depth = 0): string[] {
  if (depth > 6 || (key && shouldSkipKey(key))) return []

  if (typeof value === 'string') {
    return parentAllowsText || isPublicTextKey(key) ? [cleanText(value)] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPublicText(item, parentAllowsText, key, depth + 1))
  }

  if (!value || typeof value !== 'object') return []

  return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) => {
    const allowsText = parentAllowsText || isPublicTextKey(childKey)
    return extractPublicText(childValue, allowsText, childKey, depth + 1)
  })
}

function getContentBlocks(row: SearchableRow) {
  const blocks = row.contentBlocks
  return blocks && typeof blocks === 'object' ? blocks as Record<string, any> : {}
}

function isPublicRow(sourceType: SiteSearchSourceType, row: SearchableRow) {
  if (sourceType !== 'profile' && isSiteSearchContentPrivate(getContentBlocks(row))) return false
  if (sourceType === 'directory') return row.status === 'published'
  if (sourceType === 'profile') return row.status === 'active' && row.banned !== true
  return row.isPublished === true
}

function publicUrlFor(sourceType: SiteSearchSourceType, row: SearchableRow) {
  const slug = String(row.slug || '').trim()
  if (sourceType === 'page') {
    return row.isHomepage || slug === 'home' ? '/' : `/${slug}`
  }
  if (sourceType === 'post') return `/posts/${slug}`
  if (sourceType === 'product') return `/products/${slug}`
  if (sourceType === 'directory') return `/directory/${slug}`
  if (sourceType === 'event') return `/events/${slug}`
  if (sourceType === 'category') return `/categories/${slug}`
  if (sourceType === 'profile') {
    const username = toPublicProfileUsername(row.displayName || row.name)
    return isValidPublicProfileUsername(username) ? `/profile/${username}` : ''
  }
  return ''
}

function imageFor(sourceType: SiteSearchSourceType, row: SearchableRow) {
  if (sourceType === 'profile') return row.image || null
  return row.featuredImage || null
}

function buildSearchDocument(sourceType: SiteSearchSourceType, row: SearchableRow) {
  const siteId = row.siteId
  const sourceId = String(row.id || '')
  const title = cleanText(String(row.title || row.displayName || row.name || ''))
  const url = publicUrlFor(sourceType, row)

  if (!siteId || !sourceId || !title || !url || !isPublicRow(sourceType, row)) {
    return null
  }

  const contentText = extractPublicText(getContentBlocks(row)).join(' ')
  const summarySource = row.metaDescription || row.excerpt || row.bio || contentText
  const summary = summarySource ? truncate(cleanText(String(summarySource)), 240) : null
  const searchableText = truncate([
    title,
    row.slug,
    row.username,
    row.metaDescription,
    row.excerpt,
    row.bio,
    contentText,
  ].filter(Boolean).map(String).join(' '), 20000)

  return {
    siteId,
    sourceType,
    sourceId,
    url,
    title,
    summary,
    image: imageFor(sourceType, row),
    searchableText,
  }
}

async function syncSiteSearchDocument(sourceType: SiteSearchSourceType, row: SearchableRow) {
  const document = buildSearchDocument(sourceType, row)
  const siteId = row.siteId
  const sourceId = String(row.id || '')

  if (!document) {
    if (siteId && sourceId) await deleteSiteSearchDocument(siteId, sourceType, sourceId)
    return
  }

  await db.execute(sql`
    insert into site_search_documents (
      site_id,
      source_type,
      source_id,
      url,
      title,
      summary,
      image,
      searchable_text,
      updated_at
    )
    values (
      ${document.siteId},
      ${document.sourceType},
      ${document.sourceId},
      ${document.url},
      ${document.title},
      ${document.summary},
      ${document.image},
      ${document.searchableText},
      now()
    )
    on conflict (site_id, source_type, source_id) do update set
      url = excluded.url,
      title = excluded.title,
      summary = excluded.summary,
      image = excluded.image,
      searchable_text = excluded.searchable_text,
      updated_at = now()
  `)
}

async function deleteSiteSearchDocument(siteId: string, sourceType: SiteSearchSourceType, sourceId: string) {
  await db.execute(sql`
    delete from site_search_documents
    where site_id = ${siteId}
      and source_type = ${sourceType}
      and source_id = ${sourceId}
  `)
}

function logSiteSearchIndexError(operation: string, error: unknown) {
  console.error(`Site search index ${operation} failed:`, error)
}

export async function safeSyncSiteSearchDocument(sourceType: SiteSearchSourceType, row: SearchableRow) {
  try {
    await syncSiteSearchDocument(sourceType, row)
  } catch (error) {
    logSiteSearchIndexError(`sync ${sourceType}`, error)
  }
}

export async function safeDeleteSiteSearchDocument(siteId: string, sourceType: SiteSearchSourceType, sourceId: string) {
  try {
    await deleteSiteSearchDocument(siteId, sourceType, sourceId)
  } catch (error) {
    logSiteSearchIndexError(`delete ${sourceType}`, error)
  }
}

async function syncProfileSearchDocumentsForUser(userId: string) {
  await db.execute(sql`
    delete from site_search_documents
    where source_type = 'profile'
      and source_id = ${userId}
  `)

  const rows = await db
    .select(profileSearchSelect)
    .from(siteMemberships)
    .innerJoin(authUsers, sql`${authUsers.id} = ${siteMemberships.userId}`)
    .where(sql`${siteMemberships.userId} = ${userId} and ${siteMemberships.status} = 'active' and ${authUsers.banned} = false`)

  for (const row of rows) {
    await syncSiteSearchDocument('profile', row)
  }
}

export async function safeSyncProfileSearchDocumentsForUser(userId: string) {
  try {
    await syncProfileSearchDocumentsForUser(userId)
  } catch (error) {
    logSiteSearchIndexError('sync profile documents', error)
  }
}

async function syncProfileSearchDocumentForMembership(siteId: string, userId: string) {
  await deleteSiteSearchDocument(siteId, 'profile', userId)

  const [row] = await db
    .select(profileSearchSelect)
    .from(siteMemberships)
    .innerJoin(authUsers, sql`${authUsers.id} = ${siteMemberships.userId}`)
    .where(sql`${siteMemberships.siteId} = ${siteId} and ${siteMemberships.userId} = ${userId}`)
    .limit(1)

  if (row) await syncSiteSearchDocument('profile', row)
}

export async function safeSyncProfileSearchDocumentForMembership(siteId: string, userId: string) {
  try {
    await syncProfileSearchDocumentForMembership(siteId, userId)
  } catch (error) {
    logSiteSearchIndexError('sync profile membership', error)
  }
}

export async function rebuildSiteSearchIndexForSite(siteId: string) {
  if (!UUID_REGEX.test(siteId)) throw new Error('Site ID must be a UUID')

  await db.execute(sql`delete from site_search_documents where site_id = ${siteId}`)

  const [pageRows, postRows, productRows, directoryRows, eventRows, categoryRows, profileRows] = await Promise.all([
    db.select().from(pages).where(sql`${pages.siteId} = ${siteId}`),
    db.select().from(posts).where(sql`${posts.siteId} = ${siteId}`),
    db.select().from(products).where(sql`${products.siteId} = ${siteId}`),
    db.select().from(directories).where(sql`${directories.siteId} = ${siteId}`),
    db.select().from(events).where(sql`${events.siteId} = ${siteId}`),
    db.select().from(categories).where(sql`${categories.siteId} = ${siteId}`),
    db
      .select(profileSearchSelect)
      .from(siteMemberships)
      .innerJoin(authUsers, sql`${authUsers.id} = ${siteMemberships.userId}`)
      .where(sql`${siteMemberships.siteId} = ${siteId} and ${siteMemberships.status} = 'active' and ${authUsers.banned} = false`),
  ])

  for (const row of pageRows) await syncSiteSearchDocument('page', row)
  for (const row of postRows) await syncSiteSearchDocument('post', row)
  for (const row of productRows) await syncSiteSearchDocument('product', row)
  for (const row of directoryRows) await syncSiteSearchDocument('directory', row)
  for (const row of eventRows) await syncSiteSearchDocument('event', row)
  for (const row of categoryRows) await syncSiteSearchDocument('category', row)
  for (const row of profileRows) await syncSiteSearchDocument('profile', row)
}

export async function rebuildAllSiteSearchIndexes() {
  const rows = await db.select({ id: sites.id }).from(sites)
  for (const site of rows) {
    await rebuildSiteSearchIndexForSite(site.id)
  }
}
