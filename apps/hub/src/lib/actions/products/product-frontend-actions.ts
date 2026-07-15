'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, sites } from '@/lib/db/schema'
import { convertContentBlocksToArray, type ContentBlock as UtilProductBlock } from '@/lib/utils/block-utils'

interface ProductBlock extends UtilProductBlock {}

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

/** Get a published product only within the already-resolved request site. */
export async function getProductBySlugForSite(siteId: string, productSlug: string): Promise<GetProductResult> {
  try {
    const [product] = await db
      .select({
        id: products.id,
        siteId: products.siteId,
        title: products.title,
        slug: products.slug,
        isPublished: products.isPublished,
        featuredImage: products.featuredImage,
        metaDescription: products.metaDescription,
      })
      .from(products)
      .where(and(
        eq(products.siteId, siteId),
        eq(products.slug, productSlug),
        eq(products.isPublished, true),
      ))
      .limit(1)

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
      .where(eq(sites.id, product.siteId))

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
      is_published: product.isPublished,
      featured_image: product.featuredImage ?? null,
      meta_description: product.metaDescription ?? null,
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
