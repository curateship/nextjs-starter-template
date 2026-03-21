'use server'

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'

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

// Cached listing data function
const getCachedListingData = unstable_cache(
  async (site_id: string, contentType: string, sortBy: string, sortOrder: string, limit: number, offset: number) => {
    // Map sortBy to Drizzle column
    let orderByColumn: any = products.createdAt
    if (sortBy === 'title') {
      orderByColumn = products.title
    } else if (sortBy === 'display_order') {
      orderByColumn = products.displayOrder
    }

    const orderFn = sortOrder === 'asc' ? asc : desc

    // Get all published products to filter private ones via content_blocks
    const allProductsData = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        createdAt: products.createdAt,
        displayOrder: products.displayOrder,
        contentBlocks: products.contentBlocks,
      })
      .from(products)
      .where(and(eq(products.siteId, site_id), eq(products.isPublished, true)))
      .orderBy(orderFn(orderByColumn))

    // Filter out private products from content_blocks
    const publicProductsData = (allProductsData || []).filter(p => {
      const cb = p.contentBlocks as Record<string, any> | null
      return cb?._settings?.is_private !== true
    })

    const totalCount = publicProductsData.length

    // Apply pagination
    const paginatedProducts = publicProductsData.slice(offset, offset + limit)

    const totalPages = Math.ceil(totalCount / limit)
    const currentPage = Math.floor(offset / limit) + 1

    // Transform products - use raw SQL to get featured_image and description columns if they exist
    let transformedProducts: Array<{
      id: string
      title: string
      slug: string
      richText: string | null
      featured_image: string | null
      created_at: string
      display_order: number
    }>

    if (paginatedProducts.length > 0) {
      const ids = paginatedProducts.map(p => p.id)
      const rawRows = await db
        .select({ id: products.id, featured_image: products.featuredImage, description: products.description })
        .from(products)
        .where(inArray(products.id, ids))
      const rawMap = new Map<string, any>()
      for (const row of rawRows) {
        rawMap.set(row.id, row)
      }

      transformedProducts = paginatedProducts.map(product => {
        const raw = rawMap.get(product.id)
        return {
          id: product.id,
          title: product.title || 'Untitled',
          slug: product.slug || '',
          richText: raw?.description || '',
          featured_image: raw?.featured_image || null,
          created_at: product.createdAt ? new Date(product.createdAt).toISOString() : new Date().toISOString(),
          display_order: product.displayOrder || 0
        }
      })
    } else {
      transformedProducts = []
    }

    return {
      products: transformedProducts,
      totalCount,
      currentPage,
      totalPages
    }
  },
  ['listing-data'],
  {
    revalidate: 3600, // 1-hour cache for product listing data
    tags: ['listing-views', 'all']
  }
)

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

    // Get cached listing data
    const data = await getCachedListingData(site_id, contentType, sortBy, sortOrder, limit, offset)

    return {
      success: true,
      data
    }

  } catch (error) {
    console.error('Error loading listing views data:', error)
    return { success: false, error: 'Failed to load data' }
  }
}
