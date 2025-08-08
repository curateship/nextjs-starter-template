"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getBlockTitle } from '@/lib/blocks/block-utils'

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
 * Delete a site block with smart protection for essential blocks
 */
export async function deleteSiteBlockAction(blockId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate input
    if (!blockId) {
      return { success: false, error: 'Block ID is required' }
    }

    // Validate block_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(blockId)) {
      return { success: false, error: 'Invalid block ID format' }
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the block to verify ownership and check type
    const { data: block, error: blockError } = await supabaseAdmin
      .from('site_blocks')
      .select('id, site_id, block_type')
      .eq('id', blockId)
      .single()

    if (blockError || !block) {
      return { success: false, error: 'Block not found' }
    }

    // Smart protection: prevent deleting essential blocks
    if (block.block_type === 'navigation' || block.block_type === 'footer') {
      return { 
        success: false, 
        error: `${block.block_type === 'navigation' ? 'Navigation' : 'Footer'} blocks cannot be deleted as they are essential for site structure` 
      }
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

    // Delete the block
    const { error } = await supabaseAdmin
      .from('site_blocks')
      .delete()
      .eq('id', blockId)

    if (error) {
      return { success: false, error: `Failed to delete block: ${error.message}` }
    }

    return { success: true }

  } catch (error) {
    console.error('Error deleting site block:', error)
    return { success: false, error: 'Failed to delete block' }
  }
}

/**
 * Add a new hero block to a site
 */
export async function addSiteBlockAction(params: {
  site_id: string
  page_slug: 'home' | 'about' | 'contact'
  block_type: 'hero'
}): Promise<{
  success: boolean
  block?: Block
  error?: string
}> {
  try {
    // Validate input
    if (!params.site_id || !params.page_slug || !params.block_type) {
      return { success: false, error: 'Missing required parameters' }
    }

    // Validate site_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(params.site_id)) {
      return { success: false, error: 'Invalid site ID format' }
    }

    // Only allow hero blocks for now
    if (params.block_type !== 'hero') {
      return { success: false, error: 'Only hero blocks can be added' }
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns the site
    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, user_id')
      .eq('id', params.site_id)
      .eq('user_id', user.id)
      .single()

    if (siteError || !site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Get existing blocks to determine proper insertion order
    const { data: existingBlocks, error: orderError } = await supabaseAdmin
      .from('site_blocks')
      .select('block_type, display_order')
      .eq('site_id', params.site_id)
      .eq('page_slug', params.page_slug)
      .order('display_order', { ascending: true })

    if (orderError) {
      return { success: false, error: `Failed to check block order: ${orderError.message}` }
    }

    // Calculate proper order: navigation (1), hero blocks (2-99), footer (100)
    let insertOrder = 2 // Default hero position after navigation

    if (existingBlocks.length > 0) {
      // Find the last hero block or navigation block
      const lastHeroOrNavIndex = existingBlocks.findLastIndex(block => 
        block.block_type === 'hero' || block.block_type === 'navigation'
      )
      
      if (lastHeroOrNavIndex >= 0) {
        // Insert after the last hero or navigation block
        insertOrder = existingBlocks[lastHeroOrNavIndex].display_order + 1
      }
      
      // Ensure we don't conflict with footer (should be at 100+)
      const footerBlock = existingBlocks.find(block => block.block_type === 'footer')
      if (footerBlock && insertOrder >= footerBlock.display_order) {
        // Insert just before footer
        insertOrder = footerBlock.display_order - 1
      }
    }

    // Default content for hero block
    const defaultContent = {
      title: 'New Hero Section',
      subtitle: 'Add your subtitle here',
      primaryButton: 'Get Started',
      secondaryButton: 'Learn More',
      showRainbowButton: false,
      githubLink: '',
      showParticles: true
    }

    // Create the new block
    const { data: newBlock, error } = await supabaseAdmin
      .from('site_blocks')
      .insert({
        site_id: params.site_id,
        block_type: params.block_type,
        page_slug: params.page_slug,
        content: defaultContent,
        display_order: insertOrder,
        is_active: true
      })
      .select('*')
      .single()

    if (error) {
      return { success: false, error: `Failed to create block: ${error.message}` }
    }

    // Transform to Block format
    const block: Block = {
      id: newBlock.id,
      type: newBlock.block_type,
      title: getBlockTitle(newBlock.block_type),
      content: newBlock.content
    }

    return { success: true, block }

  } catch (error) {
    console.error('Error adding site block:', error)
    return { success: false, error: 'Failed to add block' }
  }
}