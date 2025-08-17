"use server"

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SiteWithBlocks {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  theme_id: string
  theme_name: string
  settings?: Record<string, any>
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }>
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

    // Get site with theme information
    const { data: site, error: siteError } = await supabaseAdmin
      .from('site_details')
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

    // If no page slug provided, find the homepage
    let actualPageSlug = pageSlug
    if (!pageSlug) {
      const { data: homePage, error: homePageError } = await supabaseAdmin
        .from('pages')
        .select('slug')
        .eq('site_id', site.id)
        .eq('is_homepage', true)
        .eq('is_published', true)
        .single()
      
      if (!homePageError && homePage) {
        actualPageSlug = homePage.slug
      } else {
        // Fallback to 'home' if no homepage is set
        actualPageSlug = 'home'
      }
    }

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

    // Get site blocks for this specific page and global blocks
    // Also include blocks with null page_slug for legacy compatibility
    const { data: siteBlocks, error: blocksError } = await supabaseAdmin
      .from('page_blocks')
      .select('*')
      .eq('site_id', site.id)
      .or(`page_slug.eq.${actualPageSlug},page_slug.eq.global,page_slug.is.null`)
      .order('display_order', { ascending: true })

    if (blocksError) {
      return { success: false, error: `Failed to load site blocks: ${blocksError.message}` }
    }

    // Transform blocks into simple unified format (like products)
    const blocks = (siteBlocks || []).map((block) => ({
      id: block.id,
      type: block.block_type,
      content: block.content,
      display_order: block.display_order || 0
    }))

    const siteWithBlocks: SiteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.custom_domain,
      theme_id: site.theme_id,
      theme_name: site.theme_name,
      settings: site.settings,
      blocks
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