"use server"

import { eq, and, asc, sql, or } from 'drizzle-orm'
import { unstable_cache } from '@/lib/cache'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getListingViewsData } from './page-listing-views-actions'
import { DIRECTORY_MAP_LISTING_LIMIT, isDirectoryMapBlock } from '@/lib/actions/directories/directory-map-core'
import { getDirectoryMapConfigAction } from '@/lib/actions/directories/directory-map-actions'
import { getCategoriesListingData, type CategoriesListingData } from './page-category-listing-actions'
import { getMemberDirectoryData, type MemberDirectoryData } from './page-member-directory-actions'
import { isReservedPlatformSubdomain } from '@/lib/utils/platform-host'
import { resolveSiteByHostInternal } from '@/lib/site-host-resolution'

type SitePageLookup = {
  site: typeof sites.$inferSelect
  page: typeof pages.$inferSelect | null
}

type SiteWithBlocksOptions = {
  listingPage?: number
}

const PAGE_LOOKUP_NOT_FOUND_ERROR = 'PAGE_LOOKUP_NOT_FOUND'

function normalizeSiteHost(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
}

function getSubdomainFromHost(host: string) {
  if (!host.includes('.')) return null

  const subdomain = host.split('.')[0]
  return isReservedPlatformSubdomain(subdomain) ? null : subdomain
}

function isValidPageLookupSlug(pageSlug: string) {
  if (pageSlug === 'home') return true
  if (pageSlug.length === 0 || pageSlug.length > 200) return false

  return pageSlug
    .split('/')
    .every((segment) => /^[a-zA-Z0-9_-]{1,100}$/.test(segment))
}

function isPageLookupNotFoundError(error: unknown) {
  return error instanceof Error && error.message === PAGE_LOOKUP_NOT_FOUND_ERROR
}

function orderSitesByHostMatch(host: string, subdomain: string | null) {
  return sql`
    case
      when ${sites.status} in ('active', 'draft') and ${sites.customDomain} = ${host} then 0
      when ${sites.status} in ('active', 'draft') and ${sites.subdomain} = ${subdomain} then 1
      when ${sites.customDomain} = ${host} then 2
      else 3
    end
  `
}

export async function resolveSiteByHost(hostname: string) {
  return resolveSiteByHostInternal(hostname)
}

async function getCachedSiteAndPageByHost(hostname: string, pageSlug: string) {
  const host = normalizeSiteHost(hostname)
  const subdomain = getSubdomainFromHost(host)

  return unstable_cache(
    async () => {
      const [row] = await db
        .select({ site: sites, page: pages })
        .from(sites)
        .leftJoin(
          pages,
          and(
            eq(pages.siteId, sites.id),
            eq(pages.slug, pageSlug),
            eq(pages.isPublished, true)
          )
        )
        .where(
          subdomain
            ? or(eq(sites.customDomain, host), eq(sites.subdomain, subdomain))
            : eq(sites.customDomain, host)
        )
        .orderBy(orderSitesByHostMatch(host, subdomain))
        .limit(1)

      if (row && pageSlug !== 'home' && !row.page) {
        throw new Error(PAGE_LOOKUP_NOT_FOUND_ERROR)
      }

      return row || null
    },
    ['site-page-by-host', host, pageSlug],
    { revalidate: false, tags: ['site-lookup', 'page-lookup', 'all'] }
  )()
}

async function getCachedSiteAndPageBySubdomain(subdomain: string, pageSlug: string) {
  return unstable_cache(
    async () => {
      const [row] = await db
        .select({ site: sites, page: pages })
        .from(sites)
        .leftJoin(
          pages,
          and(
            eq(pages.siteId, sites.id),
            eq(pages.slug, pageSlug),
            eq(pages.isPublished, true)
          )
        )
        .where(eq(sites.subdomain, subdomain))
        .limit(1)

      if (row && pageSlug !== 'home' && !row.page) {
        throw new Error(PAGE_LOOKUP_NOT_FOUND_ERROR)
      }

      return row || null
    },
    ['site-page-by-subdomain', subdomain, pageSlug],
    { revalidate: false, tags: ['site-lookup', 'page-lookup', 'all'] }
  )()
}

async function getCachedSiteAndPageByDomain(domain: string, pageSlug: string) {
  const host = normalizeSiteHost(domain)

  return unstable_cache(
    async () => {
      const [row] = await db
        .select({ site: sites, page: pages })
        .from(sites)
        .leftJoin(
          pages,
          and(
            eq(pages.siteId, sites.id),
            eq(pages.slug, pageSlug),
            eq(pages.isPublished, true)
          )
        )
        .where(eq(sites.customDomain, host))
        .limit(1)

      if (row && pageSlug !== 'home' && !row.page) {
        throw new Error(PAGE_LOOKUP_NOT_FOUND_ERROR)
      }

      return row || null
    },
    ['site-page-by-domain', host, pageSlug],
    { revalidate: false, tags: ['site-lookup', 'page-lookup', 'all'] }
  )()
}

export interface SiteWithBlocks {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  settings?: Record<string, any>
  page?: {
    id: string
    title: string
    slug: string
    metaDescription: string | null
    meta_description: string | null
    metaKeywords: string | null
    meta_keywords: string | null
    isHomepage: boolean
    is_homepage: boolean
  } | null
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }>
  listingData?: Record<string, any>
  /**
   * Maps key for listing-views blocks in map mode. Resolved here so the block
   * renders its final shape server-side; `undefined` when the page has no map
   * block, `null` when the site has no key configured.
   */
  mapApiKey?: string | null
  categoryListingData?: Record<string, CategoriesListingData>
  memberDirectoryData?: Record<string, MemberDirectoryData>
}

/**
 * Helper function to build blocks array for public pages
 */
function buildPublicPageBlocks(
  page: any | null
): Array<{
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}> {
  const blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }> = []

  // Add page-specific blocks
  const contentBlocks = page?.contentBlocks || page?.content_blocks
  if (contentBlocks) {
    // Convert JSON content_blocks to array format
    const pageBlocks = Object.entries(contentBlocks)
      .map(([id, block]: [string, any]) => ({
        id,
        type: block.type,
        content: block.content,
        display_order: block.display_order || 0
      }))
    blocks.push(...pageBlocks)
  }

  // Sort page-specific blocks by display_order
  blocks.sort((a, b) => a.display_order - b.display_order)

  return blocks
}

function pageHasAuthBlock(contentBlocks: unknown) {
  if (!contentBlocks || typeof contentBlocks !== 'object') return false

  return Object.values(contentBlocks).some((block: any) => block?.type === 'auth')
}

function getPublicPagePath(page: { slug: string; isHomepage?: boolean | null }) {
  return page.isHomepage ? '/' : `/${page.slug}`
}

export async function getPublicAuthPagePath(
  siteId: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    const publishedPages = await db
      .select({
        slug: pages.slug,
        isHomepage: pages.isHomepage,
        contentBlocks: pages.contentBlocks,
        displayOrder: pages.displayOrder,
        createdAt: pages.createdAt,
      })
      .from(pages)
      .where(and(eq(pages.siteId, siteId), eq(pages.isPublished, true)))
      .orderBy(asc(pages.displayOrder), asc(pages.createdAt))

    const authPage = publishedPages.find((page) => pageHasAuthBlock(page.contentBlocks))

    return { path: authPage ? getPublicPagePath(authPage) : null, error: null }
  } catch (error: any) {
    console.error('Exception in getPublicAuthPagePath:', error)
    return { path: null, error: 'Failed to resolve auth page' }
  }
}

/**
 * Helper to pre-fetch listing data for listing-views blocks
 */
async function prefetchListingData(
  blocks: Array<{ id: string; type: string; content: Record<string, any>; display_order: number }>,
  siteId: string,
  options: SiteWithBlocksOptions = {}
): Promise<Record<string, any>> {
  const listingData: Record<string, any> = {}
  const listingPage = Math.max(1, Math.floor(options.listingPage || 1))

  for (const block of blocks) {
    if (block.type === 'listing-views') {
      try {
        const {
          contentType = 'products',
          categoryIds = [],
          categoryChipParentIds = [],
          sortBy = 'date',
          sortOrder = 'desc',
          displayMode = 'grid',
          itemsToShow = 6,
          itemsPerPage = 12,
          isPaginated = false
        } = block.content

        // Map mode plots the whole (capped) result set instead of a page of cards.
        const isMapMode = isDirectoryMapBlock({ displayMode, contentType })
        const limit = isMapMode ? DIRECTORY_MAP_LISTING_LIMIT : isPaginated ? itemsPerPage : itemsToShow
        const offset = isMapMode || !isPaginated ? 0 : (listingPage - 1) * itemsPerPage

        const result = await getListingViewsData({
          site_id: siteId,
          contentType,
          categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
          sortBy,
          sortOrder,
          limit,
          offset,
          includeCategories: contentType === 'directory' && Array.isArray(categoryChipParentIds) && categoryChipParentIds.length > 0
        })

        if (result.success && result.data) {
          listingData[block.id] = result.data
        }
      } catch (error) {
        // Silently continue - block will fall back to client loading
      }
    }
  }

  return listingData
}

/**
 * Resolve the Maps key once per page when any listing-views block runs in map
 * mode. Without this the block can't know whether to draw a map until a client
 * round trip lands, so it renders an empty shell and then swaps — a visible
 * double load. Returns undefined when the page has no map block.
 */
async function prefetchMapApiKey(
  blocks: Array<{ type: string; content: Record<string, any> }>,
  siteId: string
): Promise<string | null | undefined> {
  const hasMapBlock = blocks.some(
    (block) => block.type === 'listing-views' && isDirectoryMapBlock(block.content)
  )
  if (!hasMapBlock) return undefined

  return (await getDirectoryMapConfigAction(siteId)).apiKey
}

async function prefetchCategoryListingData(
  blocks: Array<{ id: string; type: string; content: Record<string, any>; display_order: number }>,
  siteId: string
): Promise<Record<string, CategoriesListingData>> {
  const categoryListingData: Record<string, CategoriesListingData> = {}

  for (const block of blocks) {
    if (block.type === 'categories-listing') {
      try {
        const { parentCategoryId, chipsToShow = 20 } = block.content
        const result = await getCategoriesListingData({
          siteId,
          parentCategoryId: typeof parentCategoryId === 'string' ? parentCategoryId : '',
          limit: Number(chipsToShow) || 20,
        })

        if (result.success && result.data) {
          categoryListingData[block.id] = result.data
        }
      } catch (error) {
        // Silently continue - block will fall back to client loading
      }
    }
  }

  return categoryListingData
}

async function prefetchMemberDirectoryData(
  blocks: Array<{ id: string; type: string; content: Record<string, any>; display_order: number }>,
  siteId: string
): Promise<Record<string, MemberDirectoryData>> {
  const memberDirectoryData: Record<string, MemberDirectoryData> = {}

  for (const block of blocks) {
    if (block.type === 'member-directory') {
      try {
        const { includedRoles, itemsPerPage, sortBy, sortOrder } = block.content
        const result = await getMemberDirectoryData({
          siteId,
          includedRoles: Array.isArray(includedRoles) ? includedRoles : undefined,
          itemsPerPage: Number(itemsPerPage) || undefined,
          sortBy,
          sortOrder,
        })

        if (result.success && result.data) {
          memberDirectoryData[block.id] = result.data
        }
      } catch (error) {
        // Silently continue - block will fall back to client loading
      }
    }
  }

  return memberDirectoryData
}

async function buildSiteWithBlocksResult(
  lookup: SitePageLookup | null,
  actualPageSlug: string,
  options: SiteWithBlocksOptions = {}
): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  if (!lookup) {
    return { success: false, error: 'Site not found' }
  }

  const { site, page } = lookup

  if (site.status !== 'active' && site.status !== 'draft') {
    return { success: false, error: 'Site is not available for viewing' }
  }

  if (!page && actualPageSlug !== 'home') {
    return { success: false, error: 'Page not found' }
  }

  const blocks = buildPublicPageBlocks(page)
  const [listingData, mapApiKey, categoryListingData, memberDirectoryData] = await Promise.all([
    prefetchListingData(blocks, site.id, options),
    prefetchMapApiKey(blocks, site.id),
    prefetchCategoryListingData(blocks, site.id),
    prefetchMemberDirectoryData(blocks, site.id),
  ])

  return {
    success: true,
    site: {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.customDomain,
      settings: site.settings as Record<string, any>,
      page: page ? {
        id: page.id,
        title: page.title,
        slug: page.slug,
        metaDescription: page.metaDescription,
        meta_description: page.metaDescription,
        metaKeywords: page.metaKeywords,
        meta_keywords: page.metaKeywords,
        isHomepage: page.isHomepage,
        is_homepage: page.isHomepage,
      } : null,
      blocks,
      listingData: Object.keys(listingData).length > 0 ? listingData : undefined,
      mapApiKey,
      categoryListingData: Object.keys(categoryListingData).length > 0 ? categoryListingData : undefined,
      memberDirectoryData: Object.keys(memberDirectoryData).length > 0 ? memberDirectoryData : undefined,
    },
  }
}

/**
 * Get site data by request host for frontend rendering.
 */
export async function getSiteByHost(hostname: string, pageSlug?: string, options?: SiteWithBlocksOptions): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!hostname) {
      return { success: false, error: 'Host is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    if (!isValidPageLookupSlug(actualPageSlug)) {
      return { success: false, error: 'Page not found' }
    }

    const lookup = await getCachedSiteAndPageByHost(hostname, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug, options)
  } catch (error) {
    if (isPageLookupNotFoundError(error)) {
      return { success: false, error: 'Page not found' }
    }

    return { success: false, error: 'Failed to load site' }
  }
}

/**
 * Get site data by subdomain for frontend rendering
 */
export async function getSiteBySubdomain(subdomain: string, pageSlug?: string, options?: SiteWithBlocksOptions): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!subdomain) {
      return { success: false, error: 'Subdomain is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    if (!isValidPageLookupSlug(actualPageSlug)) {
      return { success: false, error: 'Page not found' }
    }

    const lookup = await getCachedSiteAndPageBySubdomain(subdomain, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug, options)

  } catch (error) {
    if (isPageLookupNotFoundError(error)) {
      return { success: false, error: 'Page not found' }
    }

    return { success: false, error: 'Failed to load site' }
  }
}

/**
 * Get site data by custom domain for subdomain routing
 */
export async function getSiteByDomain(domain: string, pageSlug?: string, options?: SiteWithBlocksOptions): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!domain) {
      return { success: false, error: 'Domain is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    if (!isValidPageLookupSlug(actualPageSlug)) {
      return { success: false, error: 'Page not found' }
    }

    const lookup = await getCachedSiteAndPageByDomain(domain, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug, options)

  } catch (error) {
    if (isPageLookupNotFoundError(error)) {
      return { success: false, error: 'Page not found' }
    }

    return { success: false, error: 'Failed to load site' }
  }
}
