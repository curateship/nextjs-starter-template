'use server'

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { posts, sites, categories, contentCategoryRelationships } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface PostBlock {
  id: string
  type: 'core' | 'related-posts' | 'table-of-contents'
  content: Record<string, any>
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface Post {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  featured_image: string | null
  excerpt: string | null
  content_blocks: Record<string, PostBlock>
  is_published: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface PostWithDetails extends Post {
  site_name: string
  subdomain: string
  user_id: string
  block_count: number
}

export interface CreatePostData {
  title: string
  slug?: string
  meta_description?: string
  featured_image?: string
  excerpt?: string
  content_blocks?: Record<string, PostBlock>
  is_published?: boolean
}

export interface UpdatePostData {
  title?: string
  slug?: string
  meta_description?: string
  featured_image?: string
  excerpt?: string
  is_published?: boolean
}

function rowToPost(row: typeof posts.$inferSelect): Post {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    slug: row.slug,
    meta_description: row.metaDescription,
    featured_image: row.featuredImage,
    excerpt: row.excerpt,
    content_blocks: (row.contentBlocks || {}) as Record<string, PostBlock>,
    is_published: row.isPublished,
    display_order: row.displayOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function revalidatePostFrontend(siteId: string, postId?: string) {
  revalidateTag('listing-views')
  revalidateTag('posts')
  revalidateTag(`site-${siteId}`)
  if (postId) revalidateTag(`post-${postId}`)
}

/**
 * Get all posts for a site
 */
export async function getSitePostsAction(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: Post[] | null; total: number; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, total: 0, error: 'Invalid site ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, error: 'User not authenticated. Please log in first.' }
    }

    // Verify user owns this site
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, total: 0, error: 'Site not found or access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize

    const [countResult, data] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(posts).where(eq(posts.siteId, siteId)),
      db.select().from(posts).where(eq(posts.siteId, siteId)).orderBy(asc(posts.displayOrder)).limit(pageSize).offset(from),
    ])

    return { data: data.map(rowToPost), total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    return {
      data: null,
      total: 0,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get posts with their categories in a single server action call.
 * Eliminates the sequential content → categories waterfall.
 */
export async function getSitePostsWithCategoriesAction(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{
  data: Post[] | null
  categories: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]>
  total: number
  error: string | null
}> {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, categories: {}, total: 0, error: 'Invalid site ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, categories: {}, total: 0, error: 'User not authenticated' }
    }

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, categories: {}, total: 0, error: 'Site not found or access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize

    const [countPromise, dataPromise] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(posts).where(eq(posts.siteId, siteId)),
      db.select().from(posts).where(eq(posts.siteId, siteId)).orderBy(desc(posts.displayOrder)).limit(pageSize).offset(from),
    ])

    const countResult = countPromise[0]
    const postRows = dataPromise.map(rowToPost)

    // Fetch categories via Drizzle
    let categoryMap: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]> = {}
    if (postRows.length > 0) {
      const postIds = postRows.map(p => p.id)
      const rels = await db
        .select({
          content_id: contentCategoryRelationships.contentId,
          category_id: contentCategoryRelationships.categoryId,
          cat_id: categories.id,
          cat_title: categories.title,
          cat_slug: categories.slug,
          cat_parent_id: categories.parentId,
        })
        .from(contentCategoryRelationships)
        .innerJoin(categories, eq(categories.id, contentCategoryRelationships.categoryId))
        .where(and(
          inArray(contentCategoryRelationships.contentId, postIds),
          eq(contentCategoryRelationships.contentType, 'post')
        ))

      if (rels.length > 0) {
        const parentIds = new Set<string>()
        for (const rel of rels) {
          if (rel.cat_parent_id) parentIds.add(rel.cat_parent_id)
        }
        let parentTitles: Record<string, string> = {}
        if (parentIds.size > 0) {
          const parents = await db
            .select({ id: categories.id, title: categories.title })
            .from(categories)
            .where(inArray(categories.id, Array.from(parentIds)))
          parentTitles = Object.fromEntries(parents.map(p => [p.id, p.title]))
        }
        for (const rel of rels) {
          const cid = rel.content_id
          if (!categoryMap[cid]) categoryMap[cid] = []
          categoryMap[cid].push({
            id: rel.cat_id,
            title: rel.cat_title,
            slug: rel.cat_slug,
            parent_id: rel.cat_parent_id,
            parent_title: rel.cat_parent_id ? parentTitles[rel.cat_parent_id] : undefined
          })
        }
      }
    }

    return { data: postRows, categories: categoryMap, total: countResult?.count ?? 0, error: null }
  } catch (error) {
    return { data: null, categories: {}, total: 0, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get a single post by ID
 */
export async function getPostByIdAction(postId: string): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))

    if (!post) {
      return { data: null, error: 'Post not found' }
    }

    // Now verify the user owns the site this post belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, post.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    return { data: rowToPost(post), error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}



/**
 * Update an existing post
 */
export async function updatePostAction(postId: string, updates: UpdatePostData): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))

    if (!post) {
      return { data: null, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, post.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Post title cannot be empty' }
    }

    // Validate and process slug if being updated
    let processedUpdates = { ...updates }
    if (updates.slug !== undefined) {
      const slug = updates.slug.trim()

      // Validate slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      // Check for reserved slugs
      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      // Check if slug conflicts with other posts (excluding current post)
      const [existingPost] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.siteId, post.siteId), eq(posts.slug, slug)))

      if (existingPost && existingPost.id !== postId) {
        return {
          data: null,
          error: `A post with the slug "${slug}" already exists. Please choose a different slug.`
        }
      }

      processedUpdates.slug = slug
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'meta_description', 'featured_image', 'excerpt', 'is_published'] as const
    const finalPostUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((processedUpdates as any)[field] !== undefined) {
        if (field === 'title' || field === 'meta_description' || field === 'featured_image' || field === 'excerpt') {
          finalPostUpdates[field] = typeof (processedUpdates as any)[field] === 'string'
            ? (processedUpdates as any)[field].trim() || null
            : (processedUpdates as any)[field]
        } else {
          finalPostUpdates[field] = (processedUpdates as any)[field]
        }
      }
    }

    // Map snake_case field names to Drizzle camelCase columns
    const drizzleUpdates: Partial<typeof posts.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (finalPostUpdates.title !== undefined) drizzleUpdates.title = finalPostUpdates.title
    if (finalPostUpdates.slug !== undefined) drizzleUpdates.slug = finalPostUpdates.slug
    if (finalPostUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalPostUpdates.meta_description
    if (finalPostUpdates.featured_image !== undefined) drizzleUpdates.featuredImage = finalPostUpdates.featured_image
    if (finalPostUpdates.excerpt !== undefined) drizzleUpdates.excerpt = finalPostUpdates.excerpt
    if (finalPostUpdates.is_published !== undefined) drizzleUpdates.isPublished = finalPostUpdates.is_published

    // Update the post
    const [updated] = await db
      .update(posts)
      .set(drizzleUpdates)
      .where(eq(posts.id, postId))
      .returning()

    if (!updated) {
      return { data: null, error: 'Failed to update post' }
    }

    revalidatePostFrontend(post.siteId, postId)

    return {
      data: rowToPost(updated),
      error: null
    }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete a post
 */
export async function deletePostAction(postId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { success: false, error: 'Invalid post ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post
    const [post] = await db
      .select({ id: posts.id, siteId: posts.siteId })
      .from(posts)
      .where(eq(posts.id, postId))

    if (!post) {
      return { success: false, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, post.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Delete the post
    await db.delete(posts).where(eq(posts.id, postId))

    revalidatePostFrontend(post.siteId, postId)

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete multiple posts at once
 */
export async function deletePostsAction(postIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!postIds.length) {
      return { success: false, error: 'No posts selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of postIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid post ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get all posts and verify they belong to sites owned by this user
    const postRows = await db
      .select({ id: posts.id, siteId: posts.siteId })
      .from(posts)
      .where(inArray(posts.id, postIds))

    if (!postRows.length) {
      return { success: false, error: 'Posts not found' }
    }

    const siteIds = [...new Set(postRows.map(p => p.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more posts' }
    }

    await db.delete(posts).where(inArray(posts.id, postIds))

    revalidateTag('listing-views')
    revalidateTag('posts')
    postRows.forEach((post) => revalidateTag(`post-${post.id}`))
    siteIds.forEach((siteId) => revalidateTag(`site-${siteId}`))

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Duplicate a post
 */
export async function duplicatePostAction(postId: string, newTitle: string): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New post title is required' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original post
    const [originalPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))

    if (!originalPost) {
      return { data: null, error: 'Post not found' }
    }

    // Verify user owns the site this post belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, originalPost.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Generate new slug
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let newSlug = baseSlug
    let counter = 1

    // Ensure unique slug
    while (true) {
      const [existingPost] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.siteId, originalPost.siteId), eq(posts.slug, newSlug)))

      if (!existingPost) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const [orderData] = await db
      .select({ displayOrder: posts.displayOrder })
      .from(posts)
      .where(eq(posts.siteId, originalPost.siteId))
      .orderBy(desc(posts.displayOrder))
      .limit(1)

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

    // Create the duplicate post with content_blocks
    const [newPost] = await db
      .insert(posts)
      .values({
        siteId: originalPost.siteId,
        title: newTitle.trim(),
        slug: newSlug,
        metaDescription: originalPost.metaDescription,
        featuredImage: originalPost.featuredImage,
        excerpt: originalPost.excerpt,
        content: originalPost.content,
        contentBlocks: originalPost.contentBlocks || {},
        isPublished: originalPost.isPublished,
        displayOrder: nextOrder,
      })
      .returning()

    if (!newPost) {
      return { data: null, error: 'Failed to duplicate post' }
    }

    revalidatePostFrontend(originalPost.siteId, newPost.id)

    return { data: rowToPost(newPost), error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get post blocks for a specific post
 */
export async function getPostBlocksAction(postId: string): Promise<{ data: Record<string, PostBlock> | null; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { data: null, error: 'Invalid post ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get content_blocks directly from posts table
    const [post] = await db
      .select({ contentBlocks: posts.contentBlocks })
      .from(posts)
      .where(eq(posts.id, postId))

    if (!post) {
      return { data: null, error: 'Post not found' }
    }

    return { data: (post.contentBlocks || {}) as Record<string, PostBlock>, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update post blocks for a specific post
 */
export async function updatePostBlocksAction(postId: string, blocks: Record<string, PostBlock>): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate post ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(postId)) {
      return { success: false, error: 'Invalid post ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the post first
    const [post] = await db
      .select({ id: posts.id, siteId: posts.siteId, contentBlocks: posts.contentBlocks })
      .from(posts)
      .where(eq(posts.id, postId))

    if (!post) {
      return { success: false, error: 'Post not found' }
    }

    // Then verify user owns the site this post belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, post.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Preserve non-block settings and merge with updated blocks
    const currentContentBlocks = (post.contentBlocks || {}) as Record<string, any>
    const preservedSettings: Record<string, any> = {}

    // Extract non-block settings (primitive values and objects without block structure)
    Object.entries(currentContentBlocks).forEach(([key, value]) => {
      // Preserve primitive values (like show_featured_image: boolean)
      if (typeof value !== 'object' || value === null) {
        preservedSettings[key] = value
      }
      // For objects, check if they're NOT blocks (don't have block structure)
      else if (typeof value === 'object' && !('id' in value && 'type' in value && 'content' in value)) {
        preservedSettings[key] = value
      }
    })

    const updatedContentBlocks = {
      ...preservedSettings,
      ...blocks
    }

    // Update content_blocks directly in the posts table
    await db
      .update(posts)
      .set({
        contentBlocks: updatedContentBlocks,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))

    revalidatePostFrontend(post.siteId, postId)

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Add a new block to a post
 */
export async function addPostBlockAction(
  postId: string,
  blockType: PostBlock['type'],
  blockContent: Record<string, any>
): Promise<{ data: PostBlock | null; error: string | null }> {
  try {
    // Get current blocks
    const { data: currentBlocks, error: getError } = await getPostBlocksAction(postId)
    if (getError) {
      return { data: null, error: getError }
    }

    // Create new block
    const blockId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const existingBlocks = Object.values(currentBlocks || {})
    const maxOrder = existingBlocks.length > 0
      ? Math.max(...existingBlocks.map(b => b.display_order))
      : 0

    const newBlock: PostBlock = {
      id: blockId,
      type: blockType,
      content: blockContent,
      display_order: maxOrder + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Update blocks with new block
    const updatedBlocks = {
      ...(currentBlocks || {}),
      [blockId]: newBlock
    }

    const { success, error } = await updatePostBlocksAction(postId, updatedBlocks)
    if (!success) {
      return { data: null, error }
    }

    return { data: newBlock, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete a block from a post
 */
export async function deletePostBlockAction(postId: string, blockId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get current blocks
    const { data: currentBlocks, error: getError } = await getPostBlocksAction(postId)
    if (getError) {
      return { success: false, error: getError }
    }

    if (!currentBlocks || !currentBlocks[blockId]) {
      return { success: false, error: 'Block not found' }
    }

    // Remove the block
    const { [blockId]: removed, ...updatedBlocks } = currentBlocks

    const { success, error } = await updatePostBlocksAction(postId, updatedBlocks)
    return { success, error }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
