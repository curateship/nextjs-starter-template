"use server"

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
          } catch {}
        },
      },
    }
  )
}

export interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export async function getAllProductBlocksAction(site_id: string): Promise<{ 
  success: boolean
  blocks?: Record<string, Block[]>
  error?: string 
}> {
  try {
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

    // Single query to load all product blocks (exactly like pages)
    const { data, error } = await supabaseAdmin
      .from('product_blocks')
      .select('*')
      .eq('site_id', site_id)
      .order('display_order', { ascending: true })

    if (error) {
      return { success: false, error: error.message }
    }

    const blocks: Record<string, Block[]> = {}
    
    // Group blocks by product_slug directly (exactly like pages)
    data?.forEach((productBlock: any) => {
      const productSlug = productBlock.product_slug
      
      if (!blocks[productSlug]) {
        blocks[productSlug] = []
      }
      
      blocks[productSlug].push({
        id: productBlock.id,
        type: productBlock.block_type,
        title: getBlockTitle(productBlock.block_type),
        content: productBlock.content
      })
    })

    return { success: true, blocks }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function getProductBlocksAction(product_id: string): Promise<{ 
  success: boolean
  blocks?: Record<string, Block[]>
  error?: string 
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, slug, site_id, sites!inner(user_id)')
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found' }
    }

    const { data, error } = await supabaseAdmin
      .from('product_blocks')
      .select('*')
      .eq('product_id', product_id)
      .eq('site_id', product.site_id)
      .order('display_order')

    if (error) {
      return { success: false, error: error.message }
    }

    const blocks: Record<string, Block[]> = {}
    
    // Load all blocks from database (including default block if it exists)
    const dbBlocks = data ? data.map(block => ({
      id: block.id,
      type: block.block_type,
      title: getBlockTitle(block.block_type),
      content: block.content
    })) : []
    
    blocks[product.slug] = dbBlocks

    return { success: true, blocks }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Save a single product block (like pages save individual blocks)
 */
export async function saveProductBlockAction(params: {
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
      .from('product_blocks')
      .select('id, product_id, site_id')
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

    // Update the block (exactly like pages)
    const { error } = await supabaseAdmin
      .from('product_blocks')
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
    console.error('Error saving product block:', error)
    return { success: false, error: 'Failed to save block' }
  }
}

/**
 * Save multiple blocks (kept for backwards compatibility, but should use individual saves)
 */
export async function saveProductBlocksAction(
  product_id: string, 
  blocks: Block[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify ownership and get site_id and slug
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, site_id, slug, sites!inner(user_id)')
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError) {
      return { success: false, error: 'Product not found' }
    }

    // Check for default block and extract product data
    const defaultBlock = blocks.find(block => block.type === 'product-default')
    if (defaultBlock) {
      // Update product with default block data
      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({
          title: defaultBlock.content.title,
          rich_text: defaultBlock.content.richText,
          featured_image: defaultBlock.content.featuredImage
        })
        .eq('id', product_id)

      if (updateError) {
        return { success: false, error: `Failed to update product: ${updateError.message}` }
      }
    }

    // Delete existing blocks
    await supabaseAdmin
      .from('product_blocks')
      .delete()
      .eq('product_id', product_id)

    // Insert all blocks including default block with site_id and product_slug (like pages)
    if (blocks.length > 0) {
      const { error } = await supabaseAdmin
        .from('product_blocks')
        .insert(blocks.map((block, index) => ({
          product_id,
          site_id: product.site_id,
          product_slug: product.slug,
          block_type: block.type,
          content: block.content,
          display_order: index
        })))

      if (error) {
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// Helper function to get block title
function getBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'product-default':
      return 'Product Information'
    case 'product-hero':
      return 'Product Hero'
    case 'product-details':
      return 'Product Details'
    case 'product-gallery':
      return 'Product Gallery'
    case 'product-features':
      return 'Product Features'
    case 'product-hotspot':
      return 'Product Hotspot'
    case 'faq':
      return 'FAQ'
    default:
      return 'Product Block'
  }
}