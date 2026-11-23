import { headers } from '@/lib/request-headers'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteSearchDocuments, sites } from '@/lib/db/schema'
import { requireSiteOwnership } from '@/lib/db/helpers'
import { rebuildSiteSearchIndexForSite } from './site-search-index'
import { getClientIp, isPersistentRateLimited, isRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import { buildSiteSearchTsQuery } from '@/lib/site-search/tsquery'
import {
  SITE_SEARCH_TYPES,
  isSiteSearchSourceType,
  normalizeSiteSearchTypes,
  type SiteSearchFilterType,
  type SiteSearchSourceType,
} from '@/lib/site-search/types'

export interface SiteSearchResultItem {
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

export interface SearchRow extends Record<string, unknown> {
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

export async function searchSiteActionImpl(input: {
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
    const tsQuery = buildSiteSearchTsQuery(query)
    const pageOptions = normalizePagination(input, { pageSize: 12, maxPageSize: 50 })
    const enabledTypes = normalizeSiteSearchTypes(input.enabledTypes)
    const filterType = normalizeFilterType(input.type)
    const searchTypes = filterType === 'all' ? enabledTypes : enabledTypes.filter((type) => type === filterType)

    if (query.length < 2 || !tsQuery || searchTypes.length === 0) {
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
        select to_tsquery('english', ${tsQuery}) as query
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

export interface SiteSearchSuggestion {
  type: SiteSearchSourceType
  title: string
  image: string | null
  url: string
}

interface SuggestionRow extends Record<string, unknown> {
  source_type: SiteSearchSourceType
  title: string
  image: string | null
  url: string
}

/** Suggestions shown per content type in the type-ahead dropdown. */
const SUGGESTIONS_PER_TYPE = 4

/**
 * A search box that waits for a typing pause sends a handful of requests a
 * minute, so this only ever stops a script hammering the endpoint. Held in
 * memory rather than the database: a suggestion has to come back while the
 * visitor is still typing, and a rate-limit write would add a round trip to
 * every keystroke pause.
 */
const SUGGEST_MAX_REQUESTS = 90
const SUGGEST_WINDOW_MS = 60 * 1000

export async function suggestSiteSearchActionImpl(input: {
  siteId: string
  query: string
  enabledTypes?: SiteSearchSourceType[]
}): Promise<{ success: boolean; data?: { items: SiteSearchSuggestion[] }; error?: string }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { success: false, error: 'Invalid site ID' }

    const query = normalizeQuery(input.query)
    const tsQuery = buildSiteSearchTsQuery(query)
    const enabledTypes = normalizeSiteSearchTypes(input.enabledTypes)

    if (query.length < 2 || !tsQuery) return { success: true, data: { items: [] } }

    const requestHeaders = await headers()
    const ip = getClientIp(requestHeaders) || 'unknown'
    if (isRateLimited(`site-search-suggest:${input.siteId}:${ip}`, SUGGEST_MAX_REQUESTS, SUGGEST_WINDOW_MS)) {
      return { success: false, error: 'Too many searches. Please wait a moment and try again.' }
    }

    // The site's status is checked in this query rather than a separate lookup
    // so a suggestion costs one database round trip, not two.
    const enabledSql = sql.join(enabledTypes.map((type) => sql`${type}`), sql`, `)
    const rows = await db.execute<SuggestionRow>(sql`
      with search_query as (
        select to_tsquery('english', ${tsQuery}) as query
      ),
      scored as (
        select
          d.source_type,
          d.title,
          d.image,
          d.url,
          d.updated_at,
          (
            ts_rank_cd(d.search_vector, q.query)
            + case when lower(d.title) = lower(${query}) then 1 else 0 end
            + case when d.title ilike ${`${query}%`} then 0.5 else 0 end
          ) as rank
        from site_search_documents d
        join sites s on s.id = d.site_id and s.status in ('active', 'draft')
        cross join search_query q
        where d.site_id = ${input.siteId}
          and d.source_type in (${enabledSql})
          and d.search_vector @@ q.query
      ),
      ranked as (
        select
          scored.*,
          row_number() over (
            partition by scored.source_type
            order by scored.rank desc, scored.updated_at desc, scored.title asc
          ) as type_rank
        from scored
      )
      select source_type, title, image, url
      from ranked
      where type_rank <= ${SUGGESTIONS_PER_TYPE}
      order by rank desc, updated_at desc, title asc
    `)

    // The index can hold two documents pointing at the same page (a listing
    // re-created under a slug it already used, for example). Offering the same
    // destination twice would waste a slot in a dropdown that only shows a few.
    const seenUrls = new Set<string>()
    const items: SiteSearchSuggestion[] = []
    for (const row of rows.rows) {
      if (!row.title || !row.url || seenUrls.has(row.url)) continue
      seenUrls.add(row.url)
      items.push({ type: row.source_type, title: row.title, image: row.image, url: row.url })
    }

    return { success: true, data: { items } }
  } catch (error) {
    console.error('Site search suggestions failed:', error)
    return { success: false, error: 'Search failed' }
  }
}

const REBUILD_MAX_REQUESTS = 5
const REBUILD_WINDOW_MS = 5 * 60 * 1000

/**
 * Rebuilds a site's search index from its current content.
 *
 * The index is otherwise only written when a piece of content is saved, so
 * anything that existed before search was added — or that arrived through an
 * import rather than the editor — is invisible to search until this runs.
 */
export async function rebuildSiteSearchIndexActionImpl(
  siteId: string
): Promise<{ success: boolean; indexed?: number; error?: string }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { success: false, error: 'Invalid site ID' }
    const { user } = await requireSiteOwnership(siteId)

    // A rebuild rewrites every document for the site, so it costs work in
    // proportion to how much content the site has. Nobody has a reason to run
    // it repeatedly, and the button is disabled while one is in flight, so this
    // only bounds direct calls to the endpoint.
    if (isRateLimited(`site-search-rebuild:${siteId}:${user.id}`, REBUILD_MAX_REQUESTS, REBUILD_WINDOW_MS)) {
      return { success: false, error: 'Rebuilt too many times just now. Please wait a few minutes.' }
    }

    await rebuildSiteSearchIndexForSite(siteId)

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(siteSearchDocuments)
      .where(eq(siteSearchDocuments.siteId, siteId))

    return { success: true, indexed: Number(row?.count || 0) }
  } catch (error) {
    console.error('Site search index rebuild failed:', error)
    // Only the ownership failure is safe to repeat back; anything else could
    // carry database detail into the admin UI.
    const message = error instanceof Error ? error.message : ''
    return {
      success: false,
      error: /unauthorized|not found|authenticat/i.test(message)
        ? 'You do not have access to this site.'
        : 'Rebuild failed. Please try again.',
    }
  }
}

export type { SiteSearchFilterType, SiteSearchSourceType }
