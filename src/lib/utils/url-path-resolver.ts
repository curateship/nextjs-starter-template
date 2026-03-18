'use server'

import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pages, posts, products } from '@/lib/db/schema'
import { convertContentBlocksToArray, type ProductBlock } from '@/lib/utils/product-block-utils'

export interface PageContent {
  id: string
  title: string
  slug: string
  is_published: boolean
  content_blocks?: Record<string, any>
  display_order?: number
}

export interface PostContent {
  id: string
  title: string
  slug: string
  is_published: boolean
  content?: string
  featured_image?: string | null
  display_order?: number
}

export interface ProductContent {
  id: string
  title: string
  slug: string
  is_published: boolean
  featured_image?: string | null
  description?: string | null
  blocks: ProductBlock[]
}

export interface PathResolution {
  type: 'page' | 'post' | 'product'
  content: PageContent | PostContent | ProductContent
}

export interface PathResolutionResult {
  success: boolean
  resolution?: PathResolution
  error?: string
}

async function checkPageBySlug(siteId: string, slug: string): Promise<PageContent | null> {
  try {
    const page = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, siteId), eq(pages.slug, slug), eq(pages.isPublished, true)),
    })
    return page ? (page as unknown as PageContent) : null
  } catch (error) {
    console.warn('Error checking page by slug:', error)
    return null
  }
}

async function checkPostBySlug(siteId: string, slug: string): Promise<PostContent | null> {
  try {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.siteId, siteId), eq(posts.slug, slug), eq(posts.isPublished, true)),
    })
    return post ? (post as unknown as PostContent) : null
  } catch (error) {
    console.warn('Error checking post by slug:', error)
    return null
  }
}

async function checkProductBySlug(siteId: string, slug: string): Promise<ProductContent | null> {
  try {
    const product = await db.query.products.findFirst({
      where: and(eq(products.siteId, siteId), eq(products.slug, slug), eq(products.isPublished, true)),
    })

    if (!product) return null

    let blocks: ProductBlock[] = []
    try {
      blocks = convertContentBlocksToArray((product.contentBlocks || {}) as Record<string, any>, product.id)
    } catch (error) {
      console.warn('Error loading product blocks:', error)
      blocks = []
    }

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      is_published: product.isPublished,
      featured_image: null,
      description: null,
      blocks
    }
  } catch (error) {
    console.warn('Error checking product by slug:', error)
    return null
  }
}

export async function resolveUrlPath(siteId: string, path: string): Promise<PathResolutionResult> {
  try {
    if (!siteId || !path) {
      return { success: false, error: 'Site ID and path are required' }
    }

    const [page, post, product] = await Promise.all([
      checkPageBySlug(siteId, path),
      checkPostBySlug(siteId, path),
      checkProductBySlug(siteId, path)
    ])

    if (page) return { success: true, resolution: { type: 'page', content: page } }
    if (post) return { success: true, resolution: { type: 'post', content: post } }
    if (product) return { success: true, resolution: { type: 'product', content: product } }

    return { success: false, error: 'No content found for this URL' }
  } catch (error) {
    return { success: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function checkSlugConflicts(siteId: string, slug: string): Promise<{
  hasConflict: boolean
  conflictType?: 'page' | 'post' | 'product'
  conflictTitle?: string
}> {
  try {
    const [page, post, product] = await Promise.all([
      checkPageBySlug(siteId, slug),
      checkPostBySlug(siteId, slug),
      checkProductBySlug(siteId, slug)
    ])

    if (page) return { hasConflict: true, conflictType: 'page', conflictTitle: page.title }
    if (post) return { hasConflict: true, conflictType: 'post', conflictTitle: post.title }
    if (product) return { hasConflict: true, conflictType: 'product', conflictTitle: product.title }

    return { hasConflict: false }
  } catch (error) {
    console.warn('Error checking slug conflicts:', error)
    return { hasConflict: false }
  }
}
