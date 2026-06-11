'use server'

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { posts, sites, categories, contentCategoryRelationships } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  generateUniqueContentSlug,
  getNextContentDisplayOrder,
  preserveNonBlockSettings,
  requireOwnedContentRow,
  requireOwnedSite,
  validateContentSlugUpdate,
} from '@/lib/actions/content/content-action-helpers'

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

export interface UpdatePostData {
  title?: string
  slug?: string
  meta_description?: string
  featured_image?: string
  excerpt?: string
  is_published?: boolean
}

type PostRow = typeof posts.$inferSelect

function rowToPost(row: PostRow): Post {
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
export async function getSitePostsAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }): Promise<{ data: Post[] | null; total: number; error: string | null }> {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, error: access.error }
    }

    const { pageSize, offset: from } = normalizePagination(options)
    const selectedSlug = options?.selectedSlug?.trim()

    const [countResult, data, selectedRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(posts).where(eq(posts.siteId, siteId)),
      db.select().from(posts).where(eq(posts.siteId, siteId)).orderBy(asc(posts.displayOrder)).limit(pageSize).offset(from),
      selectedSlug
        ? db.select().from(posts).where(and(eq(posts.siteId, siteId), eq(posts.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const selectedRow = selectedRows[0]
    const rows = selectedRow && !data.some((post) => post.id === selectedRow.id)
      ? [selectedRow, ...data]
      : data

    return { data: rows.map(rowToPost), total: countResult[0]?.count ?? 0, error: null }
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
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, categories: {}, total: 0, error: access.error }
    }

    const { pageSize, offset: from } = normalizePagination(options)

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
 * Update an existing post
 */
export async function updatePostAction(postId: string, updates: UpdatePostData): Promise<{ data: Post | null; error: string | null }> {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PostRow>(posts, postId, 'Post')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const post = access.row

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Post title cannot be empty' }
    }

    // Validate and process slug if being updated
    let processedUpdates = { ...updates }
    if (updates.slug !== undefined) {
      const slugResult = await validateContentSlugUpdate(posts, post.siteId, postId, updates.slug, 'Post')
      if (!slugResult.ok) {
        return { data: null, error: slugResult.error }
      }
      processedUpdates.slug = slugResult.slug
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PostRow>(posts, postId, 'Post')
    if (!access.ok) {
      return { success: false, error: access.error }
    }

    // Delete the post
    await db.delete(posts).where(eq(posts.id, postId))

    revalidatePostFrontend(access.row.siteId, postId)

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

    for (const id of postIds) {
      if (!UUID_REGEX.test(id)) {
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
    if (!newTitle?.trim()) {
      return { data: null, error: 'New post title is required' }
    }

    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PostRow>(posts, postId, 'Post')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const originalPost = access.row

    // Unique slug + next display order via shared helpers
    const newSlug = await generateUniqueContentSlug(posts, originalPost.siteId, newTitle)
    const nextOrder = await getNextContentDisplayOrder(posts, originalPost.siteId)

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
 * Update post blocks for a specific post
 */
export async function updatePostBlocksAction(postId: string, blocks: Record<string, PostBlock>): Promise<{ success: boolean; error: string | null }> {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PostRow>(posts, postId, 'Post')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const post = access.row

    // Preserve non-block settings and merge with updated blocks
    const updatedContentBlocks = {
      ...preserveNonBlockSettings(post.contentBlocks as Record<string, any>),
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
