'use server'

import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray, type DirectoryBlock } from '@/lib/utils/directory-block-utils'

// Create admin client for frontend data access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export interface DirectoryWithBlocks {
  id: string
  title: string
  slug: string
  is_published: boolean
  featured_image: string | null
  description: string | null
  meta_description: string | null
  blocks: DirectoryBlock[]
}

export interface GetDirectoryResult {
  success: boolean
  directory?: DirectoryWithBlocks
  error?: string
  site?: any // For direct directory access
}

/**
 * Helper function to fetch directory blocks from JSON content_blocks
 */
async function fetchDirectoryBlocks(directoryId: string): Promise<DirectoryBlock[]> {
  try {
    const { data: directory, error } = await supabaseAdmin
      .from('directory')
      .select('content_blocks')
      .eq('id', directoryId)
      .single()

    if (error || !directory) {
      console.warn('Failed to load directory for blocks:', error?.message)
      return []
    }

    // Convert JSON content_blocks to DirectoryBlock array format using shared utility
    return convertContentBlocksToArray(directory.content_blocks || {}, directoryId)
  } catch (error) {
    console.warn('Error loading directory blocks:', error)
    return []
  }
}

/**
 * Helper function to fetch site navigation and footer
 */
async function fetchSiteBlocks(siteId: string) {
  // Get the homepage for navigation/footer blocks
  const { data: homePage } = await supabaseAdmin
    .from('pages')
    .select('*')
    .eq('site_id', siteId)
    .eq('is_homepage', true)
    .eq('is_published', true)
    .single()

  if (!homePage) {
    return { navigation: null, footer: null }
  }

  // Get navigation and footer from home page's content_blocks JSON
  if (homePage.content_blocks) {
    const blocks = Object.values(homePage.content_blocks).flat() as any[]
    const navigationBlock = blocks.find(b => b.type === 'navigation')
    const footerBlock = blocks.find(b => b.type === 'footer')

    return {
      navigation: navigationBlock?.content || null,
      footer: footerBlock?.content || null
    }
  }

  return {
    navigation: null,
    footer: null
  }
}

/**
 * Get a directory by slug for a specific site (subdomain-based access)
 */
export async function getDirectoryBySlug(siteId: string, directorySlug: string): Promise<GetDirectoryResult> {
  try {
    // Get the directory
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', directorySlug)
      .eq('is_published', true)
      .single()

    if (directoryError || !directory) {
      return {
        success: false,
        error: 'Directory not found'
      }
    }

    // Get directory blocks
    const blocks = await fetchDirectoryBlocks(directory.id)

    const directoryWithBlocks: DirectoryWithBlocks = {
      id: directory.id,
      title: directory.title,
      slug: directory.slug,
      is_published: directory.is_published,
      featured_image: directory.featured_image,
      description: directory.description,
      meta_description: directory.meta_description,
      blocks
    }

    return {
      success: true,
      directory: directoryWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get a directory by slug directly (for non-subdomain access at /directories/[slug])
 */
export async function getDirectoryBySlugDirect(directorySlug: string): Promise<GetDirectoryResult> {
  try {
    // Find the directory across all sites
    const { data: directory, error: directoryError } = await supabaseAdmin
      .from('directory')
      .select('*, site_id')
      .eq('slug', directorySlug)
      .eq('is_published', true)
      .single()

    if (directoryError || !directory) {
      return {
        success: false,
        error: 'Directory not found'
      }
    }

    // Get the site data
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select(`
        *,
        themes(
          id,
          name,
          description,
          metadata
        )
      `)
      .eq('id', directory.site_id)
      .single()

    if (siteError || !site) {
      return {
        success: false,
        error: 'Site not found for this directory'
      }
    }

    // Get navigation and footer blocks from site's homepage
    const siteBlocks = await fetchSiteBlocks(site.id)

    // Get directory blocks
    const blocks = await fetchDirectoryBlocks(directory.id)

    const directoryWithBlocks: DirectoryWithBlocks = {
      id: directory.id,
      title: directory.title,
      slug: directory.slug,
      is_published: directory.is_published,
      featured_image: directory.featured_image,
      description: directory.description,
      meta_description: directory.meta_description,
      blocks
    }

    // Format site data with blocks
    const siteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.custom_domain,
      theme_id: site.theme_id,
      theme_name: site.theme_name || 'Default Theme',
      settings: site.settings,
      blocks: siteBlocks
    }

    return {
      success: true,
      directory: directoryWithBlocks,
      site: siteWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
