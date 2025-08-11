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
  blocks: {
    navigation?: {
      logo: string
      links: Array<{ text: string; url: string }>
      buttons: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>
      style: { backgroundColor: string; textColor: string }
    }
    hero?: Array<{
      title: string
      subtitle: string
      primaryButton: string
      secondaryButton: string
      primaryButtonLink: string
      secondaryButtonLink: string
      backgroundColor: string
      showRainbowButton: boolean
      githubLink: string
      showParticles: boolean
      trustedByText: string
      trustedByCount: string
      trustedByAvatars: Array<{ src: string; alt: string; fallback: string }>
    }>
    footer?: {
      logo: string
      copyright: string
      links: Array<{ text: string; url: string }>
      socialLinks: Array<{ platform: string; url: string }>
      style: { backgroundColor: string; textColor: string }
    }
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
      .from('site_blocks')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_active', true)
      .or(`page_slug.eq.${actualPageSlug},page_slug.eq.global,page_slug.is.null`)
      .order('display_order', { ascending: true })

    if (blocksError) {
      return { success: false, error: `Failed to load site blocks: ${blocksError.message}` }
    }

    // Transform blocks into frontend-friendly format
    const blocks: SiteWithBlocks['blocks'] = {}

    // Ensure we have site blocks array (could be null or empty)
    const blocksArray = siteBlocks || []

    blocksArray.forEach((block) => {
      if (block.block_type === 'navigation') {
        blocks.navigation = {
          logo: block.content.logo || '/images/logo.png',
          links: block.content.links || [],
          buttons: block.content.buttons || [],
          style: block.content.style || {
            backgroundColor: '#ffffff',
            textColor: '#000000'
          }
        }
      } else if (block.block_type === 'hero') {
        if (!blocks.hero) {
          blocks.hero = []
        }
        blocks.hero.push({
          title: block.content.title || 'Welcome to Our Site',
          subtitle: block.content.subtitle || 'Build something amazing',
          primaryButton: typeof block.content.primaryButton === 'object' && block.content.primaryButton?.text 
            ? block.content.primaryButton.text 
            : (block.content.primaryButton || 'Get Started'),
          secondaryButton: typeof block.content.secondaryButton === 'object' && block.content.secondaryButton?.text 
            ? block.content.secondaryButton.text 
            : (block.content.secondaryButton || 'Learn More'),
          primaryButtonLink: typeof block.content.primaryButton === 'object' && block.content.primaryButton?.url 
            ? block.content.primaryButton.url 
            : (block.content.primaryButtonLink || ''),
          secondaryButtonLink: typeof block.content.secondaryButton === 'object' && block.content.secondaryButton?.url 
            ? block.content.secondaryButton.url 
            : (block.content.secondaryButtonLink || ''),
          backgroundColor: block.content.backgroundColor || '#ffffff',
          showRainbowButton: block.content.showRainbowButton || false,
          githubLink: block.content.githubLink || '',
          showParticles: block.content.showParticles !== false, // default true
          trustedByText: block.content.trustedByText || 'users',
          trustedByCount: block.content.trustedByCount || '10k+',
          trustedByAvatars: block.content.trustedByAvatars || [
            { src: "", alt: "User 1", fallback: "U1" },
            { src: "", alt: "User 2", fallback: "U2" },
            { src: "", alt: "User 3", fallback: "U3" }
          ]
        })
      } else if (block.block_type === 'footer') {
        blocks.footer = {
          logo: block.content.logo || '/images/logo.png',
          copyright: block.content.copyright || '© 2024 Your Company. All rights reserved.',
          links: block.content.links || [],
          socialLinks: block.content.socialLinks || [],
          style: block.content.style || {
            backgroundColor: '#1f2937',
            textColor: '#ffffff'
          }
        }
      }
    })

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