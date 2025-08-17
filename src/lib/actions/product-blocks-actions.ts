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

    // Verify ownership
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, sites!inner(user_id)')
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

    // Insert all blocks including default block
    if (blocks.length > 0) {
      const { error } = await supabaseAdmin
        .from('product_blocks')
        .insert(blocks.map((block, index) => ({
          product_id,
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