'use server'

import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, sites } from '@/lib/db/schema'
import { convertContentBlocksToArray, type ContentBlock as UtilProductBlock } from '@/lib/utils/block-utils'

export interface ProductBlock extends UtilProductBlock {}

export interface ProductWithBlocks {
  id: string
  title: string
  slug: string
  is_published: boolean
  featured_image: string | null
  description: string | null
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
    const [product] = await db
      .select({ contentBlocks: products.contentBlocks })
      .from(products)
      .where(eq(products.id, productId))

    if (!product) {
      console.warn('Failed to load product for blocks: not found')
      return []
    }

    // Convert JSON content_blocks to ProductBlock array format using shared utility
    return convertContentBlocksToArray((product.contentBlocks || {}) as Record<string, any>, productId)
  } catch (error) {
    console.warn('Error loading product blocks:', error)
    return []
  }
}

/**
 * Helper function to fetch site navigation and footer
 */
async function fetchSiteBlocks(siteId: string) {
  // Get the homepage for navigation/footer blocks using raw SQL (content_blocks not in pages Drizzle schema)
  const result = await db.execute<{
    content_blocks: Record<string, any> | null
  }>(sql`
    SELECT content_blocks FROM pages
    WHERE site_id = ${siteId} AND is_homepage = true AND is_published = true
    LIMIT 1
  `)

  const homePage = result.rows?.[0]

  if (!homePage || !homePage.content_blocks) {
    return { navigation: null, footer: null }
  }

  const blocks = Object.values(homePage.content_blocks).flat() as any[]
  const navigationBlock = blocks.find(b => b.type === 'navigation')
  const footerBlock = blocks.find(b => b.type === 'footer')

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
    // Use raw SQL to include featured_image and description columns
    const result = await db.execute<{
      id: string
      title: string
      slug: string
      is_published: boolean
      featured_image: string | null
      description: string | null
    }>(sql`
      SELECT id, title, slug, is_published, featured_image, description
      FROM products
      WHERE site_id = ${siteId} AND slug = ${productSlug} AND is_published = true
      LIMIT 1
    `)

    const product = result.rows?.[0]
    if (!product) {
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
      featured_image: product.featured_image ?? null,
      description: product.description ?? null,
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
    // Find the product across all sites, using raw SQL for featured_image/description
    const productResult = await db.execute<{
      id: string
      site_id: string
      title: string
      slug: string
      is_published: boolean
      featured_image: string | null
      description: string | null
    }>(sql`
      SELECT id, site_id, title, slug, is_published, featured_image, description
      FROM products
      WHERE slug = ${productSlug} AND is_published = true
      LIMIT 1
    `)

    const product = productResult.rows?.[0]
    if (!product) {
      return {
        success: false,
        error: 'Product not found'
      }
    }

    // Get the site data
    const [site] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, product.site_id))

    if (!site) {
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
      featured_image: product.featured_image ?? null,
      description: product.description ?? null,
      blocks
    }

    // Format site data with blocks
    const siteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.customDomain,
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
