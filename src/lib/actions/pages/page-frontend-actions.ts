"use server"

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { getListingViewsData } from './page-listing-views-actions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cached site lookup functions (include parameter in cache key)
export async function getCachedSiteByDomain(domain: string) {
  return unstable_cache(
    async () => {
      const { data: site, error: siteError } = await supabaseAdmin
        .from('sites')
        .select('*')
        .eq('custom_domain', domain)
        .single()

      if (siteError || !site) {
        return null
      }

      return site
    },
    ['site-by-domain', domain],
    { revalidate: false, tags: ['site-lookup', 'all'] }
  )()
}

export async function getCachedSiteBySubdomain(subdomain: string) {
  return unstable_cache(
    async () => {
      const { data: site, error: siteError } = await supabaseAdmin
        .from('sites')
        .select('*')
        .eq('subdomain', subdomain)
        .single()

      if (siteError || !site) {
        return null
      }

      return site
    },
    ['site-by-subdomain', subdomain],
    { revalidate: false, tags: ['site-lookup', 'all'] }
  )()
}

export async function resolveSiteByHost(hostname: string) {
  const host = hostname.replace(/^www\./, '')
  // Try custom domain
  const byDomain = await getCachedSiteByDomain(host)
  if (byDomain && (byDomain.status === 'active' || byDomain.status === 'draft')) {
    return { id: byDomain.id, subdomain: byDomain.subdomain, custom_domain: byDomain.custom_domain }
  }
  // Try subdomain (skip common system subdomains)
  if (host.includes('.')) {
    const sub = host.split('.')[0]
    if (!['www', 'api', 'admin', 'app'].includes(sub)) {
      const bySub = await getCachedSiteBySubdomain(sub)
      if (bySub && (bySub.status === 'active' || bySub.status === 'draft')) {
        return { id: bySub.id, subdomain: bySub.subdomain, custom_domain: bySub.custom_domain }
      }
    }
  }
  return null
}

// Cached page lookup function
async function getCachedPage(siteId: string, pageSlug: string) {
  return unstable_cache(
    async () => {
      const { data: page, error: pageError } = await supabaseAdmin
        .from('pages')
        .select('*')
        .eq('site_id', siteId)
        .eq('slug', pageSlug)
        .eq('is_published', true)
        .single()

      if (pageError || !page) {
        return null
      }

      return page
    },
    ['page-lookup', siteId, pageSlug],
    {
      revalidate: false,
      tags: ['page-lookup', 'all']
    }
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
  site: any,
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

  // Add site-level navigation and footer blocks from public_pages settings
  if (site.settings?.public_pages?.navigation) {
    blocks.push({
      id: 'site-navigation',
      type: 'navigation',
      content: site.settings.public_pages.navigation,
      display_order: -1
    })
  }

  if (site.settings?.public_pages?.footer) {
    blocks.push({
      id: 'site-footer',
      type: 'footer',
      content: site.settings.public_pages.footer,
      display_order: 999
    })
  }

  // Add page-specific blocks
  if (page && page.content_blocks) {
    // Convert JSON content_blocks to array format
    const pageBlocks = Object.entries(page.content_blocks).map(([id, block]: [string, any]) => ({
      id,
      type: block.type,
      content: block.content,
      display_order: block.display_order || 0
    }))
    blocks.push(...pageBlocks)
  }

  // Sort all blocks by display_order
  blocks.sort((a, b) => a.display_order - b.display_order)

  return blocks
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

    // Get site from cache
    const site = await getCachedSiteBySubdomain(subdomain)

    if (!site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable (allow draft for development)
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available for viewing' }
    }

    // Use default 'home' if no page slug provided
    let actualPageSlug = pageSlug || 'home'

    // Check if the requested page exists and is published (cached)
    const page = await getCachedPage(site.id, actualPageSlug)

    // If no pages table exists yet (migration not run), or page not found, check if we can show blocks anyway
    if (!page) {
      // Only continue if this is the home page (simplified logic for cached version)
      if (actualPageSlug !== 'home') {
        return { success: false, error: 'Page not found' }
      }
      // For sites without pages system or home page, continue with old behavior
    }

    // Build blocks array using helper function
    const blocks = buildPublicPageBlocks(site, page)

    // Pre-fetch data for listing-views blocks to eliminate client-side loading
    let listingData: Record<string, any> = {}
    
    for (const block of blocks) {
      if (block.type === 'listing-views') {
        try {
          const {
            contentType = 'products',
            sortBy = 'date',
            sortOrder = 'desc',
            itemsToShow = 6,
            itemsPerPage = 12,
            isPaginated = false
          } = block.content
          
          const limit = isPaginated ? itemsPerPage : itemsToShow
          
          const result = await getListingViewsData({
            site_id: site.id,
            contentType,
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

    const siteWithBlocks: SiteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.custom_domain,
      settings: site.settings,
      blocks,
      listingData: Object.keys(listingData).length > 0 ? listingData : undefined
    }

    return { success: true, site: siteWithBlocks }

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
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, status')
      .eq('subdomain', subdomain)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available' }
    }

    // Get published pages
    const { data: pages, error: pagesError } = await supabaseAdmin
      .from('pages')
      .select('id, title, slug, is_homepage')
      .eq('site_id', site.id)
      .eq('is_published', true)
      .order('display_order', { ascending: true })

    if (pagesError) {
      return { success: false, error: `Failed to load pages: ${pagesError.message}` }
    }

    return { success: true, pages: pages || [] }

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

    // Get site from cache
    const site = await getCachedSiteByDomain(domain)

    if (!site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable (allow draft for development)
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available for viewing' }
    }

    // Use default 'home' if no page slug provided
    let actualPageSlug = pageSlug || 'home'

    // Check if the requested page exists and is published (cached)
    const page = await getCachedPage(site.id, actualPageSlug)

    // If no pages table exists yet (migration not run), or page not found, check if we can show blocks anyway
    if (!page) {
      // Only continue if this is the home page (simplified logic for cached version)
      if (actualPageSlug !== 'home') {
        return { success: false, error: 'Page not found' }
      }
      // For sites without pages system or home page, continue with old behavior
    }

    // Build blocks array using helper function
    const blocks = buildPublicPageBlocks(site, page)

    // Pre-fetch data for listing-views blocks to eliminate client-side loading
    let listingData: Record<string, any> = {}
    
    for (const block of blocks) {
      if (block.type === 'listing-views') {
        try {
          const {
            contentType = 'products',
            sortBy = 'date',
            sortOrder = 'desc',
            itemsToShow = 6,
            itemsPerPage = 12,
            isPaginated = false
          } = block.content
          
          const limit = isPaginated ? itemsPerPage : itemsToShow
          
          const result = await getListingViewsData({
            site_id: site.id,
            contentType,
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

    const siteWithBlocks: SiteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.custom_domain,
      settings: site.settings,
      blocks,
      listingData: Object.keys(listingData).length > 0 ? listingData : undefined
    }

    return { success: true, site: siteWithBlocks }

  } catch (error) {
    return { success: false, error: 'Failed to load site' }
  }
}