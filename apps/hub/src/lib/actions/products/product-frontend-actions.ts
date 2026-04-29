'use server'

import { eq, sql } from 'drizzle-orm'
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
  meta_description: string | null
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
 * Get a product by slug for a specific site (subdomain-based access)
 */
export async function getProductBySlug(siteId: string, productSlug: string): Promise<GetProductResult> {
  try {
    const result = await db.execute<{
      id: string
      title: string
      slug: string
      is_published: boolean
      featured_image: string | null
      meta_description: string | null
    }>(sql`
      SELECT id, title, slug, is_published, featured_image, meta_description
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
      meta_description: product.meta_description ?? null,
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
    const productResult = await db.execute<{
      id: string
      site_id: string
      title: string
      slug: string
      is_published: boolean
      featured_image: string | null
      meta_description: string | null
    }>(sql`
      SELECT id, site_id, title, slug, is_published, featured_image, meta_description
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

    // Get product blocks
    const blocks = await fetchProductBlocks(product.id)

    const productWithBlocks: ProductWithBlocks = {
      id: product.id,
      title: product.title,
      slug: product.slug,
      is_published: product.is_published,
      featured_image: product.featured_image ?? null,
      meta_description: product.meta_description ?? null,
      blocks
    }

    // Format site data with blocks
    const siteWithBlocks = {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      custom_domain: site.customDomain,
      settings: site.settings,
      blocks: []
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
