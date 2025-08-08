"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Create server client to verify user authentication
async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component cookie setting
          }
        },
      },
    }
  )
}

export interface SiteBlock {
  id: string
  site_id: string
  block_type: 'navigation' | 'hero' | 'footer'
  page_slug: 'home' | 'global'
  content: Record<string, any>
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

/**
 * Get all blocks for a site
 */
export async function getSiteBlocksAction(site_id: string): Promise<{ 
  success: boolean
  blocks?: Record<string, Block[]>
  error?: string 
}> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns this site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('site_blocks')
      .select('*')
      .eq('site_id', site_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      return { success: false, error: `Failed to load site blocks: ${error.message}` }
    }

    // Transform database blocks into the format expected by the builder
    const blocks: Record<string, Block[]> = {
      home: [],
      about: [],
      contact: []
    }

    data.forEach((siteBlock: SiteBlock) => {
      const block: Block = {
        id: siteBlock.id,
        type: siteBlock.block_type,
        title: getBlockTitle(siteBlock.block_type),
        content: siteBlock.content
      }

      // Add to appropriate page
      if (siteBlock.page_slug === 'global') {
        // Global blocks (nav, footer) go on all pages, but for builder we'll put on home
        blocks.home.push(block)
      } else {
        blocks[siteBlock.page_slug]?.push(block)
      }
    })

    return { success: true, blocks }

  } catch (error) {
    console.error('Error loading site blocks:', error)
    return { success: false, error: 'Failed to load site blocks' }
  }
}

/**
 * Save a single block's content
 */
export async function saveSiteBlockAction(params: {
  block_id: string
  content: Record<string, any>
}): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate input
    if (!params.block_id || !params.content) {
      return { success: false, error: 'Invalid parameters' }
    }

    // Validate block_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(params.block_id)) {
      return { success: false, error: 'Invalid block ID format' }
    }

    // Validate content is an object and not too large (prevent DoS)
    if (typeof params.content !== 'object' || JSON.stringify(params.content).length > 50000) {
      return { success: false, error: 'Invalid or oversized content' }
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the block to verify ownership
    const { data: block, error: blockError } = await supabaseAdmin
      .from('site_blocks')
      .select('id, site_id')
      .eq('id', params.block_id)
      .single()

    if (blockError || !block) {
      return { success: false, error: 'Block not found' }
    }

    // Verify user owns the site this block belongs to
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', block.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Update the block
    const { error } = await supabaseAdmin
      .from('site_blocks')
      .update({
        content: params.content,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.block_id)

    if (error) {
      return { success: false, error: `Failed to save block: ${error.message}` }
    }

    return { success: true }

  } catch (error) {
    console.error('Error saving site block:', error)
    return { success: false, error: 'Failed to save block' }
  }
}

/**
 * Helper function to get display title for block type
 */
function getBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'navigation':
      return 'Navigation'
    case 'hero':
      return 'Hero Section'
    case 'footer':
      return 'Footer'
    default:
      return 'Block'
  }
}