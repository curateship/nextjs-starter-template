'use server'

import { headers } from '@/lib/request-headers'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  SITE_SEARCH_TYPES,
  isSiteSearchSourceType,
  normalizeSiteSearchTypes,
  type SiteSearchFilterType,
  type SiteSearchSourceType,
} from '@/lib/site-search/types'

interface SiteSearchResultItem {
  type: SiteSearchSourceType
  title: string
  summary: string | null
  image: string | null
  url: string
}

export interface SiteSearchResult {
  items: SiteSearchResultItem[]
  facets: Record<SiteSearchSourceType, number>
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

interface SearchRow extends Record<string, unknown> {
  source_type: SiteSearchSourceType
  title: string
  summary: string | null
  image: string | null
  url: string
  total_count: number | string | null
  facets: Record<string, number> | string | null
}

function normalizeQuery(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, 120)
    : ''
}

function emptyFacets(): Record<SiteSearchSourceType, number> {
  return SITE_SEARCH_TYPES.reduce((acc, type) => {
    acc[type] = 0
    return acc
  }, {} as Record<SiteSearchSourceType, number>)
}

function normalizeFilterType(value: unknown): SiteSearchFilterType {
  return value === 'all' || isSiteSearchSourceType(value) ? value : 'all'
}

function parseFacets(value: SearchRow['facets']) {
  if (!value) return emptyFacets()
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  return { ...emptyFacets(), ...parsed }
}

export async function searchSiteAction(input: {
  siteId: string
  query: string
  type?: SiteSearchFilterType
  page?: number
  pageSize?: number
  enabledTypes?: SiteSearchSourceType[]
}): Promise<{ success: boolean; data?: SiteSearchResult; error?: string }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { success: false, error: 'Invalid site ID' }

    const query = normalizeQuery(input.query)
    const pageOptions = normalizePagination(input, { pageSize: 12, maxPageSize: 50 })
    const enabledTypes = normalizeSiteSearchTypes(input.enabledTypes)
    const filterType = normalizeFilterType(input.type)
    const searchTypes = filterType === 'all' ? enabledTypes : enabledTypes.filter((type) => type === filterType)

    if (query.length < 2 || searchTypes.length === 0) {
      return {
        success: true,
        data: {
          items: [],
          facets: emptyFacets(),
          pagination: {
            page: pageOptions.page,
            pageSize: pageOptions.pageSize,
            totalItems: 0,
            totalPages: 0,
          },
        },
      }
    }

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(
        eq(sites.id, input.siteId),
        inArray(sites.status, ['active', 'draft']),
      ))
      .limit(1)
    if (!site) return { success: false, error: 'Site not found' }

    const requestHeaders = await headers()
    const ip = getClientIp(requestHeaders) || 'unknown'
    const siteRateLimitKey = `${ip}:${input.siteId}:site-search`
    if (await isPersistentRateLimited(siteRateLimitKey, 180, 60 * 1000)) {
      return { success: false, error: 'Too many searches. Please wait a moment and try again.' }
    }

    const rateLimitKey = `${ip}:${input.siteId}:${query.toLowerCase()}:site-search`
    if (await isPersistentRateLimited(rateLimitKey, 60, 60 * 1000)) {
      return { success: false, error: 'Too many searches. Please wait a moment and try again.' }
    }

    const enabledSql = sql.join(enabledTypes.map((type) => sql`${type}`), sql`, `)
    const searchSql = sql.join(searchTypes.map((type) => sql`${type}`), sql`, `)
    const rows = await db.execute<SearchRow>(sql`
      with search_query as (
        select websearch_to_tsquery('english', ${query}) as query
      ),
      all_matches as (
        select d.source_type
        from site_search_documents d, search_query q
        where d.site_id = ${input.siteId}
          and d.source_type in (${enabledSql})
          and d.search_vector @@ q.query
      ),
      filtered_matches as (
        select
          d.source_type,
          d.title,
          d.summary,
          d.image,
          d.url,
          count(*) over() as total_count,
          (
            ts_rank_cd(d.search_vector, q.query)
            + case when lower(d.title) = lower(${query}) then 1 else 0 end
            + case when d.title ilike ${`${query}%`} then 0.5 else 0 end
          ) as rank
        from site_search_documents d, search_query q
        where d.site_id = ${input.siteId}
          and d.source_type in (${searchSql})
          and d.search_vector @@ q.query
        order by rank desc, d.updated_at desc, d.title asc
        limit ${pageOptions.pageSize}
        offset ${pageOptions.offset}
      ),
      facet_counts as (
        select source_type, count(*)::int as count
        from all_matches
        group by source_type
      ),
      facets as (
        select coalesce(jsonb_object_agg(source_type, count), '{}'::jsonb) as facets
        from facet_counts
      )
      select filtered_matches.*, facets.facets
      from facets
      left join filtered_matches on true
    `)

    const items = rows.rows
      .filter((row) => row.title && row.url)
      .map((row) => ({
        type: row.source_type,
        title: row.title,
        summary: row.summary,
        image: row.image,
        url: row.url,
      }))
    const totalItems = Number(rows.rows[0]?.total_count || 0)

    return {
      success: true,
      data: {
        items,
        facets: parseFacets(rows.rows[0]?.facets),
        pagination: {
          page: pageOptions.page,
          pageSize: pageOptions.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageOptions.pageSize),
        },
      },
    }
  } catch (error) {
    console.error('Site search failed:', error)
    return { success: false, error: 'Search failed' }
  }
}
