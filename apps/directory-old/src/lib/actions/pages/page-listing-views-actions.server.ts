import { sql } from 'drizzle-orm'
import { unstable_cache } from '@/lib/cache'
import { db } from '@/lib/db'
import { getDirectoryFeaturedJoin } from '@/lib/actions/directories/directory-featured-activation'
import {
  EARTH_RADIUS_KM,
  getBoundingBox,
  isValidCoordinate,
  normalizeRadiusKm,
  snapPoint,
  type NearMePoint,
} from '@/lib/actions/directories/directory-near-me-core'
import { UUID_REGEX } from '@/lib/utils/validation'

export type ListingViewsContentType = 'products' | 'posts' | 'directory'

/** A visitor's "near me" filter: everything within `radiusKm` of a point. */
export interface ListingViewsNearFilter extends NearMePoint {
  radiusKm: number
}

interface ListingViewsCategory {
  id: string
  title: string
  slug: string
  parent_id: string | null
  parent_title?: string
}

export interface ListingViewsItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
  richText: string | null
  metaDescription: string | null
  author: string | null
  author_image: string | null
  created_at: string
  display_order: number
  rating: number | null
  address: string | null
  latitude: number | null
  longitude: number | null
  /** Kilometres from the visitor's point; only set when a near filter is applied. */
  distanceKm: number | null
  categories: ListingViewsCategory[]
  featured: boolean
}

export interface ListingViewsData {
  items: ListingViewsItem[]
  products?: ListingViewsItem[]
  posts?: ListingViewsItem[]
  directories?: ListingViewsItem[]
  totalCount: number
  currentPage: number
  totalPages: number
}

interface ListingViewsRow extends Record<string, unknown> {
  id: string | null
  title: string | null
  slug: string | null
  featured_image: string | null
  rich_text?: string | null
  meta_description?: string | null
  author: string | null
  author_image: string | null
  created_at: Date | string | null
  display_order: number | null
  total_count: number | null
  rating?: number | string | null
  address?: string | null
  country?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  distance_km?: number | string | null
  categories?: unknown
  featured_priority?: number | null
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCategoryIds(categoryIds?: string[]) {
  return [...new Set((categoryIds || []).filter((id) => UUID_REGEX.test(id)))].sort().slice(0, 50)
}

function getCurrentPage(offset: number, limit: number) {
  return Math.floor(offset / limit) + 1
}

function getOrderByClause(sortBy: string, sortOrder: string) {
  const direction = sortOrder === 'asc' ? sql`asc` : sql`desc`
  if (sortBy === 'title') return sql`title ${direction}`
  if (sortBy === 'display_order') return sql`display_order ${direction}`
  return sql`created_at ${direction}`
}

/**
 * Haversine distance in kilometres from the visitor's point, or null with no
 * filter. Same formula as `haversineKm`, sharing its Earth radius so the
 * bounding box below always contains everything this expression measures.
 */
function getDistanceSelect(near: ListingViewsNearFilter | null) {
  if (!near) return sql`null::double precision`

  return sql`(${EARTH_RADIUS_KM} * 2 * asin(least(1, sqrt(
    power(sin(radians(d.latitude - ${near.latitude}) / 2), 2)
    + cos(radians(${near.latitude})) * cos(radians(d.latitude))
    * power(sin(radians(d.longitude - ${near.longitude}) / 2), 2)
  ))))`
}

/**
 * Bounding-box prefilter. Cheap, index-friendly and a superset of the circle;
 * the exact radius test happens on the computed distance afterwards. Listings
 * without coordinates drop out here — and only here, so an unfiltered view
 * still shows them.
 */
function getNearBoundsClause(near: ListingViewsNearFilter | null) {
  if (!near) return sql``

  const box = getBoundingBox(near, near.radiusKm)
  const longitudeClause = box.wrapsAntimeridian
    ? sql`(d.longitude >= ${box.minLongitude} or d.longitude <= ${box.maxLongitude})`
    : sql`d.longitude between ${box.minLongitude} and ${box.maxLongitude}`

  return sql`
    and d.latitude is not null
    and d.longitude is not null
    and d.latitude between ${box.minLatitude} and ${box.maxLatitude}
    and ${longitudeClause}
  `
}

function getNearRadiusClause(near: ListingViewsNearFilter | null) {
  return near ? sql`where distance_km <= ${near.radiusKm}` : sql``
}

function getCategoryJoin(categoryIds: string[], contentType: 'product' | 'post' | 'directory', contentId: ReturnType<typeof sql>) {
  if (categoryIds.length === 0) return sql``

  return sql`
    inner join (
      select distinct content_id
      from category_relationships
      where content_type = ${contentType}
        and category_id in (${sql.join(categoryIds.map((id) => sql`${id}`), sql`, `)})
    ) category_matches on category_matches.content_id = ${contentId}
  `
}

function formatDirectoryAddress(address?: string | null, country?: string | null) {
  const parts = (address || '').split(',').map((part) => part.trim()).filter(Boolean)
  const countryNames = [country, 'United States', 'USA', 'US', 'Canada', 'CA']
    .filter(Boolean)
    .map((value) => value!.toLowerCase())

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

function mapListingCategories(value: unknown): ListingViewsCategory[] {
  let categories = value
  if (typeof value === 'string') {
    try {
      categories = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(categories)) return []

  return categories.flatMap((category) => {
    if (!category || typeof category !== 'object') return []
    const item = category as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.slug !== 'string') return []

    return [{
      id: item.id,
      title: item.title,
      slug: item.slug,
      parent_id: typeof item.parent_id === 'string' ? item.parent_id : null,
      parent_title: typeof item.parent_title === 'string' ? item.parent_title : undefined,
    }]
  })
}

function mapListingRows(rows: ListingViewsRow[], limit: number, offset: number) {
  const totalCount = Number(rows[0]?.total_count ?? 0)
  const items = rows
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id!,
      title: row.title || 'Untitled',
      slug: row.slug || '',
      richText: row.rich_text || '',
      metaDescription: row.meta_description || '',
      featured_image: row.featured_image || null,
      author: row.author || null,
      author_image: row.author_image || null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      display_order: row.display_order || 0,
      rating: row.rating == null ? null : Number(row.rating),
      address: formatDirectoryAddress(row.address, row.country) || null,
      latitude: toFiniteNumber(row.latitude),
      longitude: toFiniteNumber(row.longitude),
      distanceKm: toFiniteNumber(row.distance_km),
      categories: mapListingCategories(row.categories),
      featured: row.featured_priority != null,
    }))

  return {
    items,
    totalCount,
    currentPage: getCurrentPage(offset, limit),
    totalPages: Math.ceil(totalCount / limit),
  }
}

async function getProductsListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[]) {
  const rows = await db.execute<ListingViewsRow>(sql`
    with filtered as (
      select
        p.id,
        p.title,
        p.slug,
        p.featured_image,
        p.meta_description as rich_text,
        coalesce(u."displayName", u.name) as author,
        u.image as author_image,
        p.created_at,
        p.display_order
      from products p
      inner join sites s on s.id = p.site_id
      inner join users u on u.id = s.user_id
      ${getCategoryJoin(categoryIds, 'product', sql`p.id`)}
      where p.site_id = ${site_id}
        and p.is_published = true
        and coalesce(p.content_blocks #>> '{_settings,is_private}', 'false') <> 'true'
    ),
    total as (
      select count(*)::int as total_count from filtered
    ),
    paged as (
      select * from filtered
      order by ${getOrderByClause(sortBy, sortOrder)}
      limit ${limit}
      offset ${offset}
    )
    select paged.*, total.total_count
    from total
    left join paged on true
  `)

  const data = mapListingRows(rows.rows, limit, offset)
  return { ...data, products: data.items }
}

async function getPostsListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[]) {
  const rows = await db.execute<ListingViewsRow>(sql`
    with filtered as (
      select
        p.id,
        p.title,
        p.slug,
        p.featured_image,
        p.excerpt as rich_text,
        coalesce(u."displayName", u.name) as author,
        u.image as author_image,
        p.created_at,
        p.display_order
      from posts p
      inner join sites s on s.id = p.site_id
      inner join users u on u.id = s.user_id
      ${getCategoryJoin(categoryIds, 'post', sql`p.id`)}
      where p.site_id = ${site_id}
        and p.is_published = true
    ),
    total as (
      select count(*)::int as total_count from filtered
    ),
    paged as (
      select * from filtered
      order by ${getOrderByClause(sortBy, sortOrder)}
      limit ${limit}
      offset ${offset}
    )
    select paged.*, total.total_count
    from total
    left join paged on true
  `)

  const data = mapListingRows(rows.rows, limit, offset)
  return { ...data, posts: data.items }
}

function getDirectoryCategoriesSelect(includeCategories: boolean) {
  if (!includeCategories) return sql`'[]'::jsonb`

  return sql`coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'slug', c.slug,
      'parent_id', c.parent_id,
      'parent_title', parent.title
    ) order by c.display_order desc, c.title)
    from category_relationships cr
    inner join categories c on c.id = cr.category_id and c.site_id = d.site_id
    left join categories parent on parent.id = c.parent_id and parent.site_id = d.site_id
    where cr.content_id = d.id
      and cr.content_type = 'directory'
      and c.is_published = true
  ), '[]'::jsonb)`
}

async function getDirectoryListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[], includeCategories: boolean, near: ListingViewsNearFilter | null) {
  // Nearest-first is what the visitor asked for, so it wins outright; featured
  // listings keep their usual lift under every other sort.
  const orderBy = near && sortBy === 'distance'
    ? sql`distance_km asc`
    : sql`(featured_priority is not null) desc, featured_priority desc nulls last, ${getOrderByClause(sortBy, sortOrder)}`

  const rows = await db.execute<ListingViewsRow>(sql`
    with filtered as (
      select
        d.id,
        d.title,
        d.slug,
        d.featured_image,
        d.meta_description,
        coalesce(u."displayName", u.name) as author,
        u.image as author_image,
        d.created_at,
        d.display_order,
        case
          when core_block.content #>> '{rating}' ~ '^[0-9]+(\\.[0-9]+)?$'
          then (core_block.content #>> '{rating}')::numeric
          else null
        end as rating,
        nullif(core_block.content #>> '{address}', '') as address,
        null as country,
        d.latitude,
        d.longitude,
        ${getDistanceSelect(near)} as distance_km,
        ${getDirectoryCategoriesSelect(includeCategories)} as categories,
        featured.priority as featured_priority
      from directory d
      inner join sites s on s.id = d.site_id
      inner join users u on u.id = s.user_id
      left join lateral (
        select block.value->'content' as content
        from jsonb_each(coalesce(d.content_blocks, '{}'::jsonb)) as block(key, value)
        where block.value->>'type' = 'directory-core'
        limit 1
      ) core_block on true
      ${getDirectoryFeaturedJoin(sql`d`)}
      ${getCategoryJoin(categoryIds, 'directory', sql`d.id`)}
      where d.site_id = ${site_id}
        and d.status = 'published'
        ${getNearBoundsClause(near)}
    ),
    matched as (
      select * from filtered ${getNearRadiusClause(near)}
    ),
    total as (
      select count(*)::int as total_count from matched
    ),
    paged as (
      select * from matched
      order by ${orderBy}
      limit ${limit}
      offset ${offset}
    )
    select paged.*, total.total_count
    from total
    left join paged on true
  `)

  const data = mapListingRows(rows.rows, limit, offset)
  return { ...data, directories: data.items }
}

// Cached listing data function
const getCachedListingData = unstable_cache(
  async (site_id: string, contentType: ListingViewsContentType, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[], includeCategories: boolean) => {
    if (contentType === 'posts') {
      return getPostsListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds)
    }

    if (contentType === 'directory') {
      return getDirectoryListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds, includeCategories, null)
    }

    return getProductsListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds)
  },
  ['listing-data-v15'],
  {
    revalidate: 3600,
    tags: ['listing-views', 'all']
  }
)

/**
 * Validate a visitor-supplied near filter. Returns null for anything that is
 * not a usable point, which simply means "no distance filter".
 */
function normalizeNearFilter(near: unknown): ListingViewsNearFilter | null {
  if (!near || typeof near !== 'object') return null
  const { latitude, longitude, radiusKm } = near as Record<string, unknown>
  if (!isValidCoordinate(latitude, longitude)) return null

  const point = snapPoint({ latitude: Number(latitude), longitude: Number(longitude) })
  return { ...point, radiusKm: normalizeRadiusKm(radiusKm) }
}

/**
 * Get data for listing views block
 */
export async function getListingViewsDataImpl(params: {
  site_id: string
  contentType: ListingViewsContentType
  categoryIds?: string[]
  sortBy: 'date' | 'title' | 'display_order' | 'distance'
  sortOrder: 'asc' | 'desc'
  limit?: number
  offset?: number
  includeCategories?: boolean
  /** Directory only: keep listings within `radiusKm` of this point. */
  near?: { latitude: number; longitude: number; radiusKm: number }
}): Promise<{
  success: boolean
  data?: ListingViewsData
  error?: string
}> {
  try {
    const { site_id, contentType } = params
    const limit = Number.isFinite(params.limit) ? Math.min(100, Math.max(1, Math.floor(params.limit!))) : 6
    const offset = Number.isFinite(params.offset) ? Math.min(100_000, Math.max(0, Math.floor(params.offset!))) : 0
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc'
    const categoryIds = normalizeCategoryIds(params.categoryIds)
    const includeCategories = contentType === 'directory' && params.includeCategories === true
    // Distance is a directory-only concept and meaningless without a point.
    const near = contentType === 'directory' ? normalizeNearFilter(params.near) : null
    const sortBy = params.sortBy === 'title' || params.sortBy === 'display_order'
      ? params.sortBy
      : params.sortBy === 'distance' && near
        ? 'distance'
        : 'date'

    if (!UUID_REGEX.test(site_id)) {
      return { success: false, error: 'Valid site ID is required' }
    }

    if (contentType !== 'products' && contentType !== 'posts' && contentType !== 'directory') {
      return { success: false, error: 'Unsupported content type' }
    }

    // Near-me results deliberately skip the cache: every visitor point is a
    // different key, so caching them would evict the shared page payloads the
    // 500-entry store exists for, and buy nothing (each key is used once).
    const data = near
      ? await getDirectoryListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds, includeCategories, near)
      : await getCachedListingData(site_id, contentType, sortBy, sortOrder, limit, offset, categoryIds, includeCategories)

    return {
      success: true,
      data
    }

  } catch (error) {
    console.error('Error loading listing views data:', error)
    return { success: false, error: 'Failed to load data' }
  }
}
