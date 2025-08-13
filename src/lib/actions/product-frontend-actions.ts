'use server'

import { createClient } from '@supabase/supabase-js'

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

export interface ProductBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

export interface ProductWithBlocks {
  id: string
  title: string
  slug: string
  meta_description: string | null
  meta_keywords: string | null
  is_published: boolean
  blocks: ProductBlock[]
}

export interface GetProductResult {
  success: boolean
  product?: ProductWithBlocks
  error?: string
}

/**
 * Get a product by slug for frontend display
 */
export async function getProductBySlug(siteId: string, productSlug: string): Promise<GetProductResult> {
  try {
    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', productSlug)
      .eq('is_published', true) // Only show published products on frontend
      .single()

    if (productError) {
      // Check if it's a table not found error (products table doesn't exist yet)
      if (productError.message.includes('relation') && productError.message.includes('does not exist')) {
        return {
          success: false,
          error: 'Products feature not yet available'
        }
      }
      
      if (productError.code === 'PGRST116') {
        return {
          success: false,
          error: 'Product not found'
        }
      }
      
      return {
        success: false,
        error: `Failed to fetch product: ${productError.message}`
      }
    }

    if (!product) {
      return {
        success: false,
        error: 'Product not found'
      }
    }

    // For now, return empty blocks array since we haven't implemented product blocks storage yet
    // TODO: Get actual product blocks from database
    const productWithBlocks: ProductWithBlocks = {
      id: product.id,
      title: product.title,
      slug: product.slug,
      meta_description: product.meta_description,
      meta_keywords: product.meta_keywords,
      is_published: product.is_published,
      blocks: [] // Empty for now - will be populated from database in future
    }

    return {
      success: true,
      product: productWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}