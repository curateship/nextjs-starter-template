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
  blocks: {
    navigation?: {
      logo: string
      links: Array<{ text: string; url: string }>
      style: { backgroundColor: string; textColor: string }
    }
    hero?: {
      title: string
      subtitle: string
      primaryButton: string
      secondaryButton: string
      showRainbowButton: boolean
      githubLink: string
      showParticles: boolean
    }
    footer?: {
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
export async function getSiteBySubdomain(subdomain: string): Promise<{
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

    // Get site blocks for this site
    const { data: siteBlocks, error: blocksError } = await supabaseAdmin
      .from('site_blocks')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (blocksError) {
      return { success: false, error: `Failed to load site blocks: ${blocksError.message}` }
    }

    // Transform blocks into frontend-friendly format
    const blocks: SiteWithBlocks['blocks'] = {}

    siteBlocks.forEach((block) => {
      if (block.block_type === 'navigation') {
        blocks.navigation = {
          logo: block.content.logo || '/images/logo.png',
          links: block.content.links || [],
          style: block.content.style || {
            backgroundColor: '#ffffff',
            textColor: '#000000'
          }
        }
      } else if (block.block_type === 'hero') {
        blocks.hero = {
          title: block.content.title || 'Welcome to Our Site',
          subtitle: block.content.subtitle || 'Build something amazing',
          primaryButton: block.content.primaryButton || 'Get Started',
          secondaryButton: block.content.secondaryButton || 'Learn More',
          showRainbowButton: block.content.showRainbowButton || false,
          githubLink: block.content.githubLink || '',
          showParticles: block.content.showParticles !== false // default true
        }
      } else if (block.block_type === 'footer') {
        blocks.footer = {
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