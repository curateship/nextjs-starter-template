"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getBlockTitle } from '@/lib/shared-blocks/block-utils'

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
  block_type: 'navigation' | 'hero' | 'footer' | 'rich-text' | 'faq'
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
      .from('page_blocks')
      .select('*')
      .eq('site_id', site_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      return { success: false, error: `Failed to load site blocks: ${error.message}` }
    }

    // Transform database blocks into the format expected by the builder
    const blocks: Record<string, Block[]> = {}

    data.forEach((siteBlock: SiteBlock) => {
      const block: Block = {
        id: siteBlock.id,
        type: siteBlock.block_type,
        title: getBlockTitle(siteBlock.block_type),
        content: siteBlock.content
      }

      const pageSlug = siteBlock.page_slug === 'global' ? 'home' : siteBlock.page_slug

      // Initialize page array if it doesn't exist
      if (!blocks[pageSlug]) {
        blocks[pageSlug] = []
      }

      blocks[pageSlug].push(block)
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

    // Security: Additional validation for FAQ content
    if (params.content.faqItems && Array.isArray(params.content.faqItems)) {
      // Limit number of FAQ items to prevent DoS
      if (params.content.faqItems.length > 50) {
        return { success: false, error: 'Too many FAQ items (max 50)' }
      }
      
      // Validate each FAQ item
      for (const item of params.content.faqItems) {
        if (typeof item !== 'object' || !item.id || !item.question || !item.answer) {
          return { success: false, error: 'Invalid FAQ item structure' }
        }
        
        // Sanitize and validate FAQ item content
        if (typeof item.question !== 'string' || item.question.length > 500) {
          return { success: false, error: 'FAQ question too long (max 500 chars)' }
        }
        
        if (typeof item.answer !== 'string' || item.answer.length > 2000) {
          return { success: false, error: 'FAQ answer too long (max 2000 chars)' }
        }
        
        // Check for dangerous content
        const dangerousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /<iframe/gi,
          /<object/gi,
          /<embed/gi
        ]
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(item.question) || pattern.test(item.answer)) {
            return { success: false, error: 'Potentially dangerous content detected' }
          }
        }
      }
    }

    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the block to verify ownership
    const { data: block, error: blockError } = await supabaseAdmin
      .from('page_blocks')
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
      .from('page_blocks')
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
      .from('page_blocks')
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
      .from('page_blocks')
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
/**
 * Reorder site blocks by updating their display_order
 */
export async function reorderSiteBlocksAction(params: {
  site_id: string
  page_slug: string
  block_ids: string[]
}): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate input
    if (!params.site_id || !params.page_slug || !Array.isArray(params.block_ids)) {
      return { success: false, error: 'Missing required parameters' }
    }

    if (params.block_ids.length === 0) {
      return { success: true } // No blocks to reorder, return success
    }

    // Validate site_id is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(params.site_id)) {
      return { success: false, error: 'Invalid site ID format' }
    }

    // Validate all block IDs are valid UUIDs
    for (const blockId of params.block_ids) {
      if (!uuidRegex.test(blockId)) {
        return { success: false, error: 'Invalid block ID format' }
      }
    }

    // Validate page_slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(params.page_slug) && params.page_slug !== 'global') {
      return { success: false, error: 'Invalid page slug format' }
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

    // Get existing blocks to verify they all belong to this site and page
    const { data: existingBlocks, error: blocksError } = await supabaseAdmin
      .from('page_blocks')
      .select('id, block_type')
      .eq('site_id', params.site_id)
      .eq('page_slug', params.page_slug)
      .in('id', params.block_ids)

    if (blocksError) {
      return { success: false, error: `Failed to verify blocks: ${blocksError.message}` }
    }

    // Verify all requested blocks exist and belong to this page
    if (existingBlocks.length !== params.block_ids.length) {
      return { success: false, error: 'Some blocks not found or do not belong to this page' }
    }

    // Get protected blocks to calculate proper display order
    const { data: allBlocks, error: allBlocksError } = await supabaseAdmin
      .from('page_blocks')
      .select('id, block_type, display_order')
      .eq('site_id', params.site_id)
      .eq('page_slug', params.page_slug)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (allBlocksError) {
      return { success: false, error: `Failed to get all blocks: ${allBlocksError.message}` }
    }

    // Separate protected and reorderable blocks
    const protectedBlocks = allBlocks.filter(block => 
      block.block_type === 'navigation' || block.block_type === 'footer'
    )
    const navigationBlocks = protectedBlocks.filter(b => b.block_type === 'navigation')
    const footerBlocks = protectedBlocks.filter(b => b.block_type === 'footer')

    // Calculate display orders: navigation first, then reorderable blocks, then footer
    let currentOrder = 1

    // Update navigation blocks to be first
    const navUpdatePromises = navigationBlocks.map(async (block) => {
      const order = currentOrder++
      return supabaseAdmin
        .from('page_blocks')
        .update({
          display_order: order,
          updated_at: new Date().toISOString()
        })
        .eq('id', block.id)
    })

    // Update reorderable blocks in their new order
    const reorderUpdatePromises = params.block_ids.map(async (blockId, index) => {
      const newDisplayOrder = currentOrder + index
      
      return supabaseAdmin
        .from('page_blocks')
        .update({
          display_order: newDisplayOrder,
          updated_at: new Date().toISOString()
        })
        .eq('id', blockId)
    })

    // Update current order counter
    currentOrder += params.block_ids.length

    // Update footer blocks to be last  
    const footerUpdatePromises = footerBlocks.map(async (block) => {
      const order = currentOrder++
      return supabaseAdmin
        .from('page_blocks')
        .update({
          display_order: order,
          updated_at: new Date().toISOString()
        })
        .eq('id', block.id)
    })

    // Execute all updates
    const updatePromises = [
      ...navUpdatePromises,
      ...reorderUpdatePromises,
      ...footerUpdatePromises
    ]

    const results = await Promise.all(updatePromises)
    
    // Check if any updates failed
    const failedUpdates = results.filter(result => result.error)
    if (failedUpdates.length > 0) {
      return { success: false, error: `Failed to update block order: ${failedUpdates[0].error.message}` }
    }

    return { success: true }

  } catch (error) {
    console.error('Error reordering site blocks:', error)
    return { success: false, error: 'Failed to reorder blocks' }
  }
}

export async function addSiteBlockAction(params: {
  site_id: string
  page_slug: string
  block_type: 'hero' | 'rich-text' | 'faq'
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

    // Validate page_slug format
    if (!/^[a-zA-Z0-9_-]+$/.test(params.page_slug) && params.page_slug !== 'global') {
      return { success: false, error: 'Invalid page slug format' }
    }

    // Allow hero, rich-text, and FAQ blocks
    if (params.block_type !== 'hero' && params.block_type !== 'rich-text' && params.block_type !== 'faq') {
      return { success: false, error: 'Only hero, rich-text, and FAQ blocks can be added' }
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
      .from('page_blocks')
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

    // Default content based on block type
    let defaultContent: Record<string, any>
    
    if (params.block_type === 'hero') {
      defaultContent = {
        title: 'New Hero Section',
        subtitle: 'Add your subtitle here',
        primaryButton: 'Get Started',
        secondaryButton: 'Learn More',
        showRainbowButton: false,
        githubLink: '',
        showParticles: true,
        trustedByAvatars: [],
        heroImage: '',
        showHeroImage: false
      }
    } else if (params.block_type === 'rich-text') {
      defaultContent = {
        title: 'Content Section',
        subtitle: 'Professional content with rich formatting',
        headerAlign: 'left',
        content: '<p>This is a sample rich text block. You can add <strong>bold text</strong>, <em>italic text</em>, create lists, add links, and format your content with professional typography.</p><ul><li>Create bullet points</li><li>Add numbered lists</li><li>Include links and emphasis</li></ul><p>Perfect for contact pages, about sections, legal documents, and any content that needs professional formatting.</p>'
      }
    } else if (params.block_type === 'faq') {
      defaultContent = {
        title: 'Frequently Asked Questions',
        subtitle: 'Discover quick and comprehensive answers to common questions about our platform, services, and features.',
        faqItems: [
          {
            id: 'item-1',
            question: 'How long does shipping take?',
            answer: 'Standard shipping takes 3-5 business days, depending on your location. Express shipping options are available at checkout for 1-2 business day delivery.'
          },
          {
            id: 'item-2',
            question: 'What payment methods do you accept?',
            answer: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, Apple Pay, and Google Pay. For enterprise customers, we also offer invoicing options.'
          },
          {
            id: 'item-3',
            question: 'Can I change or cancel my order?',
            answer: 'You can modify or cancel your order within 1 hour of placing it. After this window, please contact our customer support team who will assist you with any changes.'
          }
        ]
      }
    } else {
      defaultContent = {}
    }

    // Create the new block
    const { data: newBlock, error } = await supabaseAdmin
      .from('page_blocks')
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