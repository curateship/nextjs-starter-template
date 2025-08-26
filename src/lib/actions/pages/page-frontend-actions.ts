"use server"

import { createClient } from '@supabase/supabase-js'
import { getListingViewsData } from './page-listing-views-actions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
 * Get site data by subdomain for frontend rendering
 */
export async function getSiteBySubdomain(subdomain: string, pageSlug?: string, homepageSlug: string = 'home'): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!subdomain) {
      return { success: false, error: 'Subdomain is required' }
    }

    // Get site from database (no theme join needed)
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('subdomain', subdomain)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable (allow draft for development)
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available for viewing' }
    }

    // Use homepage slug from site mappings (no database query needed)
    let actualPageSlug = pageSlug || homepageSlug

    // Check if the requested page exists and is published
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', actualPageSlug)
      .eq('is_published', true)
      .single()

    // If no pages table exists yet (migration not run), or page not found, check if we can show blocks anyway
    if (pageError || !page) {
      // Only continue if pages table doesn't exist or this is the home page
      if (pageError?.code === 'PGRST204' && actualPageSlug !== 'home') {
        return { success: false, error: 'Page not found' }
      }
      // For sites without pages system or home page, continue with old behavior
    }

    // Get blocks from page's content_blocks JSON column and site navigation/footer
    let blocks: Array<{
      id: string
      type: string
      content: Record<string, any>
      display_order: number
    }> = []

    // Add site-level navigation and footer blocks
    if (site.settings?.navigation) {
      blocks.push({
        id: 'site-navigation',
        type: 'navigation',
        content: site.settings?.navigation,
        display_order: -1
      })
    }

    if (site.settings?.footer) {
      blocks.push({
        id: 'site-footer',
        type: 'footer',
        content: site.settings?.footer,
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
          console.error('Failed to pre-fetch listing data for block', block.id, error)
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
 * Check if a site subdomain exists and is active
 */
export async function checkSubdomainExists(subdomain: string): Promise<{
  exists: boolean
  isActive?: boolean
}> {
  try {
    const { data: site, error } = await supabaseAdmin
      .from('sites')
      .select('id, status')
      .eq('subdomain', subdomain)
      .single()

    if (error || !site) {
      return { exists: false }
    }

    return { 
      exists: true, 
      isActive: site.status === 'active' 
    }

  } catch (error) {
    return { exists: false }
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
export async function getSiteByDomain(domain: string, pageSlug?: string, homepageSlug: string = 'home'): Promise<{
  success: boolean
  site?: SiteWithBlocks
  error?: string
}> {
  try {
    if (!domain) {
      return { success: false, error: 'Domain is required' }
    }

    // Get site by custom domain from database (no theme join needed)
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('custom_domain', domain)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found' }
    }

    // Check if site is viewable (allow draft for development)
    if (site.status !== 'active' && site.status !== 'draft') {
      return { success: false, error: 'Site is not available for viewing' }
    }

    // Use homepage slug from site mappings (no database query needed)
    let actualPageSlug = pageSlug || homepageSlug

    // Check if the requested page exists and is published
    const { data: page, error: pageError } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', actualPageSlug)
      .eq('is_published', true)
      .single()

    // If no pages table exists yet (migration not run), or page not found, check if we can show blocks anyway
    if (pageError || !page) {
      // Only continue if pages table doesn't exist or this is the home page
      if (pageError?.code === 'PGRST204' && actualPageSlug !== 'home') {
        return { success: false, error: 'Page not found' }
      }
      // For sites without pages system or home page, continue with old behavior
    }

    // Get blocks from page's content_blocks JSON column and site navigation/footer
    let blocks: Array<{
      id: string
      type: string
      content: Record<string, any>
      display_order: number
    }> = []

    // Add site-level navigation and footer blocks
    if (site.settings?.navigation) {
      blocks.push({
        id: 'site-navigation',
        type: 'navigation',
        content: site.settings?.navigation,
        display_order: -1
      })
    }

    if (site.settings?.footer) {
      blocks.push({
        id: 'site-footer',
        type: 'footer',
        content: site.settings?.footer,
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
          console.error('Failed to pre-fetch listing data for block', block.id, error)
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