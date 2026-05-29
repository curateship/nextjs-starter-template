"use server"

import { eq, and, asc, sql, or } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getListingViewsData } from './page-listing-views-actions'
import { isReservedPlatformSubdomain } from '@/lib/utils/platform-host'

type SitePageLookup = {
  site: typeof sites.$inferSelect
  page: typeof pages.$inferSelect | null
}

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

async function getCachedSiteByHost(hostname: string) {
  const host = normalizeSiteHost(hostname)
  const subdomain = getSubdomainFromHost(host)

  return unstable_cache(
    async () => {
      const [site] = await db
        .select()
        .from(sites)
        .where(
          subdomain
            ? or(eq(sites.customDomain, host), eq(sites.subdomain, subdomain))
            : eq(sites.customDomain, host)
        )
        .orderBy(orderSitesByHostMatch(host, subdomain))
        .limit(1)

      return site || null
    },
    ['site-by-host', host],
    { revalidate: false, tags: ['site-lookup', 'all'] }
  )()
}

export async function resolveSiteByHost(hostname: string) {
  const site = await getCachedSiteByHost(hostname)

  if (site && (site.status === 'active' || site.status === 'draft')) {
    return { id: site.id, subdomain: site.subdomain, custom_domain: site.customDomain }
  }

  return null
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
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }>
  listingData?: Record<string, any>
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
  siteId: string
): Promise<Record<string, any>> {
  let listingData: Record<string, any> = {}

  for (const block of blocks) {
    if (block.type === 'listing-views') {
      try {
        const {
          contentType = 'products',
          categoryIds = [],
          sortBy = 'date',
          sortOrder = 'desc',
          itemsToShow = 6,
          itemsPerPage = 12,
          isPaginated = false
        } = block.content

        const limit = isPaginated ? itemsPerPage : itemsToShow

        const result = await getListingViewsData({
          site_id: siteId,
          contentType,
          categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
          sortBy,
          sortOrder,
          limit,
          offset: 0
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

async function buildSiteWithBlocksResult(
  lookup: SitePageLookup | null,
  actualPageSlug: string
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
  const listingData = await prefetchListingData(blocks, site.id)

  return {
    success: true,
    site: {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.customDomain,
      settings: site.settings as Record<string, any>,
      blocks,
      listingData: Object.keys(listingData).length > 0 ? listingData : undefined,
    },
  }
}

/**
 * Get site data by request host for frontend rendering.
 */
export async function getSiteByHost(hostname: string, pageSlug?: string): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!hostname) {
      return { success: false, error: 'Host is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    const lookup = await getCachedSiteAndPageByHost(hostname, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug)
  } catch (error) {
    return { success: false, error: 'Failed to load site' }
  }
}

/**
 * Get site data by subdomain for frontend rendering
 */
export async function getSiteBySubdomain(subdomain: string, pageSlug?: string): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!subdomain) {
      return { success: false, error: 'Subdomain is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    const lookup = await getCachedSiteAndPageBySubdomain(subdomain, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug)

  } catch (error) {
    return { success: false, error: 'Failed to load site' }
  }
}

/**
 * Get all published pages for a site by subdomain (for navigation)
 */
export async function getSitePages(subdomain: string): Promise<{
  success: boolean
  pages?: Array<{
    id: string
    title: string
    slug: string
    is_homepage: boolean
  }>
  error?: string
}> {
  try {
    if (!subdomain) {
      return { success: false, error: 'Subdomain is required' }
    }

    // Get site by subdomain
    const [site] = await db
      .select({ id: sites.id, status: sites.status })
      .from(sites)
      .where(eq(sites.subdomain, subdomain))

    if (!site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available' }
    }

    // Get published pages
    const result = await db
      .select({
        id: pages.id,
        title: pages.title,
        slug: pages.slug,
        is_homepage: pages.isHomepage,
      })
      .from(pages)
      .where(and(eq(pages.siteId, site.id), eq(pages.isPublished, true)))
      .orderBy(asc(pages.displayOrder))

    return { success: true, pages: result || [] }

  } catch (error) {
    return { success: false, error: 'Failed to load pages' }
  }
}

/**
 * Get site data by custom domain for subdomain routing
 */
export async function getSiteByDomain(domain: string, pageSlug?: string): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!domain) {
      return { success: false, error: 'Domain is required' }
    }

    const actualPageSlug = pageSlug || 'home'
    const lookup = await getCachedSiteAndPageByDomain(domain, actualPageSlug)

    return await buildSiteWithBlocksResult(lookup, actualPageSlug)

  } catch (error) {
    return { success: false, error: 'Failed to load site' }
  }
}
