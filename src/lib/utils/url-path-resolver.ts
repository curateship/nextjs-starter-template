'use server'

import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray, type ProductBlock } from '@/lib/utils/product-block-utils'

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

// Content type definitions
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

/**
 * Check if a page exists for the given site and slug
 */
async function checkPageBySlug(siteId: string, slug: string): Promise<PageContent | null> {
  try {
    const { data: page, error } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error || !page) {
      return null
    }

    return page
  } catch (error) {
    console.warn('Error checking page by slug:', error)
    return null
  }
}

/**
 * Check if a post exists for the given site and slug
 */
async function checkPostBySlug(siteId: string, slug: string): Promise<PostContent | null> {
  try {
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error || !post) {
      return null
    }

    return post
  } catch (error) {
    console.warn('Error checking post by slug:', error)
    return null
  }
}

/**
 * Check if a product exists for the given site and slug
 */
async function checkProductBySlug(siteId: string, slug: string): Promise<ProductContent | null> {
  try {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error || !product) {
      return null
    }

    // Get product blocks from JSON content_blocks
    let blocks: ProductBlock[] = []
    try {
      blocks = convertContentBlocksToArray(product.content_blocks || {}, product.id)
    } catch (error) {
      console.warn('Error loading product blocks:', error)
      blocks = []
    }

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      is_published: product.is_published,
      featured_image: product.featured_image,
      description: product.description,
      blocks
    }
  } catch (error) {
    console.warn('Error checking product by slug:', error)
    return null
  }
}


/**
 * Simple URL path resolver that checks content types in priority order
 * Priority: Pages → Posts → Products
 * 
 * @param siteId - The site ID to search within
 * @param path - The URL path to resolve
 * @returns PathResolutionResult with the resolved content and type
 */
export async function resolveUrlPath(siteId: string, path: string): Promise<PathResolutionResult> {
  try {
    if (!siteId || !path) {
      return {
        success: false,
        error: 'Site ID and path are required'
      }
    }

    // Check all content types in parallel for better performance
    const [page, post, product] = await Promise.all([
      checkPageBySlug(siteId, path),
      checkPostBySlug(siteId, path),
      checkProductBySlug(siteId, path)
    ])
    
    // Return first match in priority order: Pages → Posts → Products
    if (page) {
      return {
        success: true,
        resolution: {
          type: 'page',
          content: page
        }
      }
    }
    
    if (post) {
      return {
        success: true,
        resolution: {
          type: 'post',
          content: post
        }
      }
    }
    
    if (product) {
      return {
        success: true,
        resolution: {
          type: 'product',
          content: product
        }
      }
    }

    // No content found
    return {
      success: false,
      error: 'No content found for this URL'
    }

  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Check if a slug exists across all content types for the given site
 * Used for validation during content creation to prevent conflicts
 * 
 * @param siteId - The site ID to search within
 * @param slug - The slug to check for conflicts
 * @returns Object with conflict information
 */
export async function checkSlugConflicts(siteId: string, slug: string): Promise<{
  hasConflict: boolean
  conflictType?: 'page' | 'post' | 'product'
  conflictTitle?: string
}> {
  try {
    // Check all content types in parallel for efficiency
    const [page, post, product] = await Promise.all([
      checkPageBySlug(siteId, slug),
      checkPostBySlug(siteId, slug),
      checkProductBySlug(siteId, slug)
    ])

    // Return first conflict found (in priority order)
    if (page) {
      return {
        hasConflict: true,
        conflictType: 'page',
        conflictTitle: page.title
      }
    }

    if (post) {
      return {
        hasConflict: true,
        conflictType: 'post',
        conflictTitle: post.title
      }
    }

    if (product) {
      return {
        hasConflict: true,
        conflictType: 'product',
        conflictTitle: product.title
      }
    }

    return { hasConflict: false }

  } catch (error) {
    console.warn('Error checking slug conflicts:', error)
    return { hasConflict: false }
  }
}