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

export interface ProductBlock {
  id: string
  product_id: string
  block_type: 'product-hero' | 'product-details' | 'product-gallery'
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
 * Get all blocks for a product
 */
export async function getProductBlocksAction(product_id: string): Promise<{ 
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

    // Verify user owns this product (through site ownership)
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found or access denied' }
    }

    const { data, error } = await supabaseAdmin
      .from('product_blocks')
      .select('*')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      // If table doesn't exist yet (migration not applied), return empty blocks
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return { success: true, blocks: {} }
      }
      return { success: false, error: `Failed to load product blocks: ${error.message}` }
    }

    // Transform database blocks into the format expected by the builder
    const blocks: Record<string, Block[]> = {}
    
    if (data) {
      // Group blocks by product slug (we'll use the product_id as the key for now)
      const productSlug = 'product-' + product_id // Simplified for now
      blocks[productSlug] = data.map(block => ({
        id: block.id,
        type: block.block_type,
        title: getBlockTitle(block.block_type),
        content: block.content
      }))
    }

    return { success: true, blocks }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Save all blocks for a product
 */
export async function saveProductBlocksAction(
  product_id: string, 
  blocks: Block[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns this product (through site ownership)
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', product_id)
      .eq('sites.user_id', user.id)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found or access denied' }
    }

    // Start a transaction to update blocks
    const { error: deleteError } = await supabaseAdmin
      .from('product_blocks')
      .delete()
      .eq('product_id', product_id)

    if (deleteError) {
      // If table doesn't exist yet, continue (migration not applied)
      if (!deleteError.message.includes('relation') || !deleteError.message.includes('does not exist')) {
        return { success: false, error: `Failed to clear existing blocks: ${deleteError.message}` }
      }
    }

    // Insert new blocks
    if (blocks.length > 0) {
      const productBlocks = blocks.map((block, index) => ({
        product_id,
        block_type: block.type as 'product-hero' | 'product-details' | 'product-gallery',
        content: block.content,
        display_order: index,
        is_active: true
      }))

      const { error: insertError } = await supabaseAdmin
        .from('product_blocks')
        .insert(productBlocks)

      if (insertError) {
        // If table doesn't exist yet, return success (migration not applied)
        if (insertError.message.includes('relation') && insertError.message.includes('does not exist')) {
          console.warn('product_blocks table does not exist yet. Migration 018 needs to be applied.')
          return { success: true }
        }
        return { success: false, error: `Failed to save blocks: ${insertError.message}` }
      }
    }

    return { success: true }
  } catch (error) {
    return { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// Helper function to get block title
function getBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'product-hero':
      return 'Product Hero'
    case 'product-details':
      return 'Product Details'
    case 'product-gallery':
      return 'Product Gallery'
    default:
      return 'Product Block'
  }
}