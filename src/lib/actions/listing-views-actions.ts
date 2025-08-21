'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ListingViewsData {
  products?: Array<{
    id: string
    title: string
    slug: string
    featured_image: string | null
    richText: string | null
    created_at: string
    display_order: number
  }>
  totalCount: number
  currentPage: number
  totalPages: number
}

/**
 * Get data for listing views block
 */
export async function getListingViewsData(params: {
  site_id: string
  contentType: 'products'
  sortBy: 'date' | 'title' | 'display_order'
  sortOrder: 'asc' | 'desc'
  limit?: number
  offset?: number
}): Promise<{
  success: boolean
  data?: ListingViewsData
  error?: string
}> {
  try {
    const { site_id, contentType, sortBy, sortOrder, limit = 6, offset = 0 } = params

    if (!site_id) {
      return { success: false, error: 'Site ID is required' }
    }

    // For now, only handle products
    if (contentType !== 'products') {
      return { success: false, error: 'Only products content type is supported' }
    }

    // Map sortBy to database column
    let orderColumn = 'created_at'
    if (sortBy === 'title') {
      orderColumn = 'title'
    } else if (sortBy === 'display_order') {
      orderColumn = 'display_order'
    }

    // Get total count for pagination
    const { count, error: countError } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site_id)
      .eq('is_published', true)

    if (countError) {
      return { success: false, error: `Failed to count products: ${countError.message}` }
    }

    // Get products with pagination
    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select('id, title, slug, created_at, display_order, content_blocks')
      .eq('site_id', site_id)
      .eq('is_published', true)
      .order(orderColumn, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      return { success: false, error: `Failed to load products: ${error.message}` }
    }

    const totalCount = count || 0
    const totalPages = Math.ceil(totalCount / limit)
    const currentPage = Math.floor(offset / limit) + 1

    // Transform products to extract featured_image and richText from content_blocks
    const transformedProducts = (products || []).map(product => ({
      ...product,
      featured_image: product.content_blocks?.['product-default']?.featuredImage || null,
      richText: product.content_blocks?.['product-default']?.richText || null
    }))

    return {
      success: true,
      data: {
        products: transformedProducts,
        totalCount,
        currentPage,
        totalPages
      }
    }

  } catch (error) {
    console.error('Error loading listing views data:', error)
    return { success: false, error: 'Failed to load data' }
  }
}