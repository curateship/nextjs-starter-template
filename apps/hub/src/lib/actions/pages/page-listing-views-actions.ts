'use server'

import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { authUsers, posts, products, sites } from '@/lib/db/schema'

export type ListingViewsContentType = 'products' | 'posts'

export interface ListingViewsItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
  richText: string | null
  author: string | null
  author_image: string | null
  created_at: string
  display_order: number
}

export interface ListingViewsData {
  items: ListingViewsItem[]
  products?: ListingViewsItem[]
  posts?: ListingViewsItem[]
  totalCount: number
  currentPage: number
  totalPages: number
}

function getCurrentPage(offset: number, limit: number) {
  return Math.floor(offset / limit) + 1
}

async function getProductsListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number) {
  let orderByColumn: any = products.createdAt
  if (sortBy === 'title') {
    orderByColumn = products.title
  } else if (sortBy === 'display_order') {
    orderByColumn = products.displayOrder
  }

  const orderFn = sortOrder === 'asc' ? asc : desc

  // Products can be hidden from listings through content_blocks settings.
  const allProductsData = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      createdAt: products.createdAt,
      displayOrder: products.displayOrder,
      contentBlocks: products.contentBlocks,
      featuredImage: products.featuredImage,
      metaDescription: products.metaDescription,
      authorName: authUsers.name,
      authorDisplayName: authUsers.displayName,
      authorImage: authUsers.image,
    })
    .from(products)
    .innerJoin(sites, eq(sites.id, products.siteId))
    .innerJoin(authUsers, eq(authUsers.id, sites.userId))
    .where(and(eq(products.siteId, site_id), eq(products.isPublished, true)))
    .orderBy(orderFn(orderByColumn))

  const publicProductsData = (allProductsData || []).filter(p => {
    const cb = p.contentBlocks as Record<string, any> | null
    return cb?._settings?.is_private !== true
  })

  const items = publicProductsData.slice(offset, offset + limit).map(product => ({
    id: product.id,
    title: product.title || 'Untitled',
    slug: product.slug || '',
    richText: product.metaDescription || '',
    featured_image: product.featuredImage || null,
    author: product.authorDisplayName || product.authorName || null,
    author_image: product.authorImage || null,
    created_at: product.createdAt ? new Date(product.createdAt).toISOString() : new Date().toISOString(),
    display_order: product.displayOrder || 0
  }))

  return {
    items,
    products: items,
    totalCount: publicProductsData.length,
    currentPage: getCurrentPage(offset, limit),
    totalPages: Math.ceil(publicProductsData.length / limit)
  }
}

async function getPostsListingData(site_id: string, sortBy: string, sortOrder: string, limit: number, offset: number) {
  let orderByColumn: any = posts.createdAt
  if (sortBy === 'title') {
    orderByColumn = posts.title
  } else if (sortBy === 'display_order') {
    orderByColumn = posts.displayOrder
  }

  const orderFn = sortOrder === 'asc' ? asc : desc

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.siteId, site_id), eq(posts.isPublished, true))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        featuredImage: posts.featuredImage,
        excerpt: posts.excerpt,
        createdAt: posts.createdAt,
        displayOrder: posts.displayOrder,
        authorName: authUsers.name,
        authorDisplayName: authUsers.displayName,
        authorImage: authUsers.image,
      })
      .from(posts)
      .innerJoin(sites, eq(sites.id, posts.siteId))
      .innerJoin(authUsers, eq(authUsers.id, sites.userId))
      .where(and(eq(posts.siteId, site_id), eq(posts.isPublished, true)))
      .orderBy(orderFn(orderByColumn))
      .limit(limit)
      .offset(offset)
  ])

  const items = rows.map(post => ({
    id: post.id,
    title: post.title || 'Untitled',
    slug: post.slug || '',
    richText: post.excerpt || '',
    featured_image: post.featuredImage || null,
    author: post.authorDisplayName || post.authorName || null,
    author_image: post.authorImage || null,
    created_at: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
    display_order: post.displayOrder || 0
  }))

  const totalCount = countResult[0]?.count ?? 0

  return {
    items,
    posts: items,
    totalCount,
    currentPage: getCurrentPage(offset, limit),
    totalPages: Math.ceil(totalCount / limit)
  }
}

// Cached listing data function
const getCachedListingData = unstable_cache(
  async (site_id: string, contentType: ListingViewsContentType, sortBy: string, sortOrder: string, limit: number, offset: number) => {
    if (contentType === 'posts') {
      return getPostsListingData(site_id, sortBy, sortOrder, limit, offset)
    }

    return getProductsListingData(site_id, sortBy, sortOrder, limit, offset)
  },
  ['listing-data-v3'],
  {
    revalidate: 3600,
    tags: ['listing-views', 'all']
  }
)

/**
 * Get data for listing views block
 */
export async function getListingViewsData(params: {
  site_id: string
  contentType: ListingViewsContentType
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

    if (contentType !== 'products' && contentType !== 'posts') {
      return { success: false, error: 'Unsupported content type' }
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
