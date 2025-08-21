'use server'

import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray, type ProductBlock as UtilProductBlock } from '@/lib/utils/product-block-utils'

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

export interface ProductBlock extends UtilProductBlock {}

export interface ProductWithBlocks {
  id: string
  title: string
  slug: string
  is_published: boolean
  blocks: ProductBlock[]
}

export interface GetProductResult {
  success: boolean
  product?: ProductWithBlocks
  error?: string
  site?: any // For direct product access
}

/**
 * Helper function to fetch product blocks from JSON content_blocks
 */
async function fetchProductBlocks(productId: string): Promise<ProductBlock[]> {
  try {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select('content_blocks')
      .eq('id', productId)
      .single()

    if (error || !product) {
      console.warn('Failed to load product for blocks:', error?.message)
      return []
    }

    // Convert JSON content_blocks to ProductBlock array format using shared utility
    return convertContentBlocksToArray(product.content_blocks || {}, productId)
  } catch (error) {
    console.warn('Error loading product blocks:', error)
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

  // Get navigation and footer blocks
  const { data: pageBlocks } = await supabaseAdmin
    .from('page_blocks')
    .select('*')
    .eq('page_id', homePage.id)
    .in('block_type', ['navigation', 'footer'])

  const navigationBlock = pageBlocks?.find(b => b.block_type === 'navigation')
  const footerBlock = pageBlocks?.find(b => b.block_type === 'footer')

  return {
    navigation: navigationBlock?.content || null,
    footer: footerBlock?.content || null
  }
}

/**
 * Get a product by slug for a specific site (subdomain-based access)
 */
export async function getProductBySlug(siteId: string, productSlug: string): Promise<GetProductResult> {
  try {
    // Get the product
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', productSlug)
      .eq('is_published', true)
      .single()

    if (productError || !product) {
      return {
        success: false,
        error: 'Product not found'
      }
    }

    // Get product blocks
    const blocks = await fetchProductBlocks(product.id)

    const productWithBlocks: ProductWithBlocks = {
      id: product.id,
      title: product.title,
      slug: product.slug,
      is_published: product.is_published,
      blocks
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

/**
 * Get a product by slug directly (for non-subdomain access at /products/[slug])
 */
export async function getProductBySlugDirect(productSlug: string): Promise<GetProductResult> {
  try {
    // Find the product across all sites
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*, site_id')
      .eq('slug', productSlug)
      .eq('is_published', true)
      .single()

    if (productError || !product) {
      return {
        success: false,
        error: 'Product not found'
      }
    }

    // Get the site data
    const { data: site, error: siteError } = await supabaseAdmin
      .from('site_details')
      .select('*')
      .eq('id', product.site_id)
      .single()

    if (siteError || !site) {
      return {
        success: false,
        error: 'Site not found for this product'
      }
    }

    // Get navigation and footer blocks from site's homepage
    const siteBlocks = await fetchSiteBlocks(site.id)

    // Get product blocks
    const blocks = await fetchProductBlocks(product.id)

    const productWithBlocks: ProductWithBlocks = {
      id: product.id,
      title: product.title,
      slug: product.slug,
      is_published: product.is_published,
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
      product: productWithBlocks,
      site: siteWithBlocks
    }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}