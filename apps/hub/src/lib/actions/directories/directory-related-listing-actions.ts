'use server'

import { unstable_cache } from 'next/cache'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { UUID_REGEX } from '@/lib/utils/validation'

const DEFAULT_ITEMS_TO_SHOW = 5
const MIN_ITEMS_TO_SHOW = 1
const MAX_ITEMS_TO_SHOW = 20

export interface DirectoryRelatedListingItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
  meta_description: string | null
  rating: number | null
  address: string | null
  category: {
    id: string
    title: string
    slug: string
  } | null
}

interface DirectoryRelatedListingRow extends Record<string, unknown> {
  id: string | null
  title: string | null
  slug: string | null
  featured_image: string | null
  meta_description: string | null
  rating: string | number | null
  address: string | null
  category_id: string | null
  category_title: string | null
  category_slug: string | null
}

function toRelatedListingItem(row: DirectoryRelatedListingRow): DirectoryRelatedListingItem | null {
  if (!row.id || !row.slug) return null

  const ratingValue = row.rating == null ? Number.NaN : Number(row.rating)

  return {
    id: row.id,
    title: row.title || 'Untitled Listing',
    slug: row.slug,
    featured_image: row.featured_image || null,
    meta_description: row.meta_description || null,
    rating: Number.isFinite(ratingValue) && ratingValue > 0 ? Math.min(5, ratingValue) : null,
    address: row.address || null,
    category: row.category_id && row.category_title && row.category_slug
      ? {
          id: row.category_id,
          title: row.category_title,
          slug: row.category_slug,
        }
      : null,
  }
}

function normalizeItemsToShow(value?: unknown): number {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_ITEMS_TO_SHOW
  }

  return Math.min(MAX_ITEMS_TO_SHOW, Math.max(MIN_ITEMS_TO_SHOW, Math.round(numericValue)))
}

const getCachedDirectoryRelatedListings = unstable_cache(
  async (
    siteId: string,
    directoryId: string,
    parentCategoryId: string,
    limit: number
  ): Promise<DirectoryRelatedListingItem[]> => {
    const rows = await db.execute<DirectoryRelatedListingRow>(sql`
      with current_directory as (
        select d.id
        from directory d
        where d.id = ${directoryId}::uuid
          and d.site_id = ${siteId}::uuid
          and d.status = 'published'
        limit 1
      ),
      current_categories as (
        select distinct cr.category_id
        from current_directory cd
        inner join category_relationships cr
          on cr.content_id = cd.id
          and cr.content_type = 'directory'
        inner join categories c
          on c.id = cr.category_id
          and c.site_id = ${siteId}::uuid
        where c.parent_id = ${parentCategoryId}::uuid
          and c.is_published = true
      )
      select
        d.id,
        d.title,
        d.slug,
        d.featured_image,
        d.meta_description,
        case
          when core_block.content #>> '{rating}' ~ '^[0-9]+(\\.[0-9]+)?$'
          then (core_block.content #>> '{rating}')::numeric
          else null
        end as rating,
        nullif(core_block.content #>> '{address}', '') as address,
        related_category.id as category_id,
        related_category.title as category_title,
        related_category.slug as category_slug
      from directory d
      left join lateral (
        select block.value->'content' as content
        from jsonb_each(coalesce(d.content_blocks, '{}'::jsonb)) as block(key, value)
        where block.value->>'type' = 'directory-core'
        limit 1
      ) core_block on true
      left join lateral (
        select c.id, c.title, c.slug
        from category_relationships cr
        inner join categories c
          on c.id = cr.category_id
          and c.site_id = d.site_id
        where cr.content_id = d.id
          and cr.content_type = 'directory'
          and c.is_published = true
          and c.parent_id = ${parentCategoryId}::uuid
          and c.id in (select category_id from current_categories)
        order by c.display_order desc, c.title
        limit 1
      ) related_category on true
      where d.site_id = ${siteId}::uuid
        and d.status = 'published'
        and d.id <> ${directoryId}::uuid
        and exists (
          select 1
          from category_relationships cr
          inner join current_categories cc on cc.category_id = cr.category_id
          where cr.content_id = d.id
            and cr.content_type = 'directory'
        )
      order by d.display_order asc, d.created_at desc, d.id asc
      limit ${limit}
    `)

    return rows.rows.flatMap((row) => {
      const item = toRelatedListingItem(row)
      return item ? [item] : []
    })
  },
  ['directory-related-listing-v3'],
  {
    revalidate: false,
    tags: ['directory', 'categories', 'content-categories', 'all'],
  }
)

export async function getDirectoryRelatedListingsAction(params: {
  siteId: string
  directoryId: string
  parentCategoryId: string
  limit?: number
}): Promise<{ success: boolean; data: DirectoryRelatedListingItem[]; error?: string }> {
  try {
    const siteId = params.siteId?.trim()
    const directoryId = params.directoryId?.trim()
    const parentCategoryId = params.parentCategoryId?.trim()

    if (!siteId || !directoryId || !parentCategoryId) {
      return { success: true, data: [] }
    }

    if (!UUID_REGEX.test(siteId) || !UUID_REGEX.test(directoryId) || !UUID_REGEX.test(parentCategoryId)) {
      return { success: false, data: [], error: 'Invalid related listing request' }
    }

    const limit = normalizeItemsToShow(params.limit)
    const data = await getCachedDirectoryRelatedListings(siteId, directoryId, parentCategoryId, limit)

    return { success: true, data }
  } catch (error) {
    console.error('Error loading related directory listings:', error)
    return { success: false, data: [], error: 'Failed to load related listings' }
  }
}
