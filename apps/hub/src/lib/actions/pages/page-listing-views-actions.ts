'use server'

import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

export type ListingViewsContentType = 'products' | 'posts' | 'directory'

export interface ListingViewsCategory {
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
  categories: ListingViewsCategory[]
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  categories?: unknown
}

function normalizeCategoryIds(categoryIds?: string[]) {
  return [...new Set((categoryIds || []).filter((id) => UUID_REGEX.test(id)))].sort()
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
      categories: mapListingCategories(row.categories),
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

async function getDirectoryListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[], includeCategories: boolean) {
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
        ${getDirectoryCategoriesSelect(includeCategories)} as categories
      from directory d
      inner join sites s on s.id = d.site_id
      inner join users u on u.id = s.user_id
      left join lateral (
        select block.value->'content' as content
        from jsonb_each(coalesce(d.content_blocks, '{}'::jsonb)) as block(key, value)
        where block.value->>'type' = 'directory-core'
        limit 1
      ) core_block on true
      ${getCategoryJoin(categoryIds, 'directory', sql`d.id`)}
      where d.site_id = ${site_id}
        and d.status = 'published'
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
  return { ...data, directories: data.items }
}

// Cached listing data function
const getCachedListingData = unstable_cache(
  async (site_id: string, contentType: ListingViewsContentType, sortBy: string, sortOrder: string, limit: number, offset: number, categoryIds: string[], includeCategories: boolean) => {
    if (contentType === 'posts') {
      return getPostsListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds)
    }

    if (contentType === 'directory') {
      return getDirectoryListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds, includeCategories)
    }

    return getProductsListingData(site_id, sortBy, sortOrder, limit, offset, categoryIds)
  },
  ['listing-data-v12'],
  {
    revalidate: 3600,
    tags: ['listing-views', 'all']
  }
)

/**
 * Get data for listing views block
 */
export async function getListingViewsData(params: {
  site_id: string
  contentType: ListingViewsContentType
  categoryIds?: string[]
  sortBy: 'date' | 'title' | 'display_order'
  sortOrder: 'asc' | 'desc'
  limit?: number
  offset?: number
  includeCategories?: boolean
}): Promise<{
  success: boolean
  data?: ListingViewsData
  error?: string
}> {
  try {
    const { site_id, contentType, sortBy, sortOrder, limit = 6, offset = 0 } = params
    const categoryIds = normalizeCategoryIds(params.categoryIds)
    const includeCategories = contentType === 'directory' && params.includeCategories === true

    if (!site_id) {
      return { success: false, error: 'Site ID is required' }
    }

    if (contentType !== 'products' && contentType !== 'posts' && contentType !== 'directory') {
      return { success: false, error: 'Unsupported content type' }
    }

    // Get cached listing data
    const data = await getCachedListingData(site_id, contentType, sortBy, sortOrder, limit, offset, categoryIds, includeCategories)

    return {
      success: true,
      data
    }

  } catch (error) {
    console.error('Error loading listing views data:', error)
    return { success: false, error: 'Failed to load data' }
  }
}
