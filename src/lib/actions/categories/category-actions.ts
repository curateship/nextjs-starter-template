'use server'

import { eq, and, desc, ne, inArray, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { applyDefaultBlocks } from '@/lib/utils/default-blocks'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface Category {
  id: string
  site_id: string
  title: string
  slug: string
  parent_id: string | null
  featured_image: string | null
  description: string | null
  meta_description: string | null
  content_blocks: Record<string, any>
  is_published: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface CreateCategoryData {
  title: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

export interface UpdateCategoryData {
  title?: string
  slug?: string
  parent_id?: string | null
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

/**
 * Get all categories for a site
 */
export async function getCategoriesForSiteAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, error: 'Authentication required' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { id: true, userId: true },
    })

    if (!site) {
      return { data: null, total: 0, error: 'Site not found' }
    }

    if (site.userId !== user.id) {
      return { data: null, total: 0, error: 'Unauthorized' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const [categories, countResult] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.siteId, siteId))
        .orderBy(desc(categories.displayOrder))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(categories)
        .where(eq(categories.siteId, siteId)),
    ])

    const total = Number(countResult[0]?.count ?? 0)

    return { data: categories as unknown as Category[], total, error: null }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return { data: null, total: 0, error: 'Failed to fetch categories' }
  }
}

/**
 * Get categories with assignment counts in a single action (1 auth check, parallel queries)
 */
export async function getCategoriesWithCountsAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Authentication required' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { id: true, userId: true },
    })

    if (!site) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Site not found' }
    }

    if (site.userId !== user.id) {
      return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Unauthorized' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const [categoriesResult, countResult] = await Promise.all([
      db
        .select({
          id: categories.id,
          site_id: categories.siteId,
          title: categories.title,
          slug: categories.slug,
          parent_id: categories.parentId,
          featured_image: categories.featuredImage,
          description: categories.description,
          meta_description: categories.metaDescription,
          content_blocks: categories.contentBlocks,
          is_published: categories.isPublished,
          display_order: categories.displayOrder,
          created_at: categories.createdAt,
          updated_at: categories.updatedAt,
        })
        .from(categories)
        .where(eq(categories.siteId, siteId))
        .orderBy(desc(categories.displayOrder))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(categories)
        .where(eq(categories.siteId, siteId)),
    ])

    const total = Number(countResult[0]?.count ?? 0)

    // Fetch assignment counts for the returned categories
    const counts: Record<string, number> = {}
    const categoryIds = categoriesResult.map(c => c.id)
    if (categoryIds.length > 0) {
      const relationships = await db
        .select({ categoryId: contentCategoryRelationships.categoryId })
        .from(contentCategoryRelationships)
        .where(inArray(contentCategoryRelationships.categoryId, categoryIds))

      for (const rel of relationships) {
        counts[rel.categoryId] = (counts[rel.categoryId] || 0) + 1
      }
    }

    return {
      data: categoriesResult as unknown as Category[],
      total,
      counts,
      error: null
    }
  } catch (error) {
    console.error('Error fetching categories with counts:', error)
    return { data: null, total: 0, counts: {} as Record<string, number>, error: 'Failed to fetch categories' }
  }
}

/**
 * Create a new category
 */
export async function createCategoryAction(
  siteId: string,
  data: CreateCategoryData
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { id: true, userId: true, settings: true },
    })

    if (!site) {
      return { data: null, error: 'Site not found' }
    }

    if (site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.title)

    // Check if slug already exists for this site
    const existingCategory = await db.query.categories.findFirst({
      where: and(eq(categories.siteId, siteId), eq(categories.slug, slug)),
      columns: { id: true },
    })

    if (existingCategory) {
      return { data: null, error: 'A category with this slug already exists' }
    }

    // If parent_id is provided, verify it exists and belongs to the same site
    if (data.parent_id) {
      const parentCategory = await db.query.categories.findFirst({
        where: and(eq(categories.id, data.parent_id), eq(categories.siteId, siteId)),
        columns: { id: true },
      })

      if (!parentCategory) {
        return { data: null, error: 'Parent category not found' }
      }
    }

    // Get the highest display_order
    const maxOrderResult = await db
      .select({ displayOrder: categories.displayOrder })
      .from(categories)
      .where(eq(categories.siteId, siteId))
      .orderBy(desc(categories.displayOrder))
      .limit(1)

    const nextDisplayOrder = maxOrderResult.length > 0 ? maxOrderResult[0].displayOrder + 1 : 0

    // Create the category
    const [newCategory] = await db
      .insert(categories)
      .values({
        siteId,
        title: data.title,
        slug,
        parentId: data.parent_id || null,
        featuredImage: data.featured_image || null,
        description: data.description || null,
        metaDescription: data.meta_description || null,
        contentBlocks: applyDefaultBlocks(data.content_blocks, 'categories', (site as any).settings?.default_blocks?.categories),
        isPublished: data.is_published ?? false,
        displayOrder: nextDisplayOrder,
      })
      .returning()

    if (!newCategory) {
      return { data: null, error: 'Failed to create category' }
    }

    revalidateTag('categories')
    revalidateTag(`site-${siteId}`)

    return { data: newCategory as unknown as Category, error: null }
  } catch (error) {
    console.error('Error creating category:', error)
    return { data: null, error: 'Failed to create category' }
  }
}

/**
 * Update a category
 */
export async function updateCategoryAction(categoryId: string, data: UpdateCategoryData) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { data: null, error: 'Invalid category ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch category
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
    })

    if (!category) {
      return { data: null, error: 'Category not found' }
    }

    // Verify ownership via site
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Validate and process slug if being updated
    if (data.slug !== undefined) {
      const slug = data.slug.trim()

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      if (slug !== category.slug) {
        const existingCategory = await db.query.categories.findFirst({
          where: and(
            eq(categories.siteId, category.siteId),
            eq(categories.slug, slug),
            ne(categories.id, categoryId)
          ),
          columns: { id: true },
        })

        if (existingCategory) {
          return { data: null, error: 'A category with this slug already exists' }
        }
      }
    }

    // If parent_id is being updated, verify it exists and prevent circular references
    if (data.parent_id !== undefined) {
      if (data.parent_id === categoryId) {
        return { data: null, error: 'A category cannot be its own parent' }
      }

      if (data.parent_id) {
        const parentCategory = await db.query.categories.findFirst({
          where: and(eq(categories.id, data.parent_id), eq(categories.siteId, category.siteId)),
          columns: { id: true, parentId: true },
        })

        if (!parentCategory) {
          return { data: null, error: 'Parent category not found' }
        }

        // Check for circular reference
        if (parentCategory.parentId === categoryId) {
          return { data: null, error: 'Circular parent relationship detected' }
        }
      }
    }

    // Build updates with explicit field whitelist
    const finalUpdates: Record<string, any> = {}

    if (data.title !== undefined) {
      finalUpdates.title = typeof data.title === 'string' ? data.title.trim() || null : data.title
    }
    if (data.slug !== undefined) {
      finalUpdates.slug = data.slug
    }
    if (data.parent_id !== undefined) {
      finalUpdates.parentId = data.parent_id
    }
    if (data.is_published !== undefined) {
      finalUpdates.isPublished = data.is_published
    }
    if (data.featured_image !== undefined) {
      finalUpdates.featuredImage = typeof data.featured_image === 'string' ? data.featured_image.trim() || null : data.featured_image
    }
    if (data.description !== undefined) {
      finalUpdates.description = typeof data.description === 'string' ? data.description.trim() || null : data.description
    }
    if (data.meta_description !== undefined) {
      finalUpdates.metaDescription = typeof data.meta_description === 'string' ? data.meta_description.trim() || null : data.meta_description
    }
    if (data.content_blocks !== undefined) {
      finalUpdates.contentBlocks = data.content_blocks
    }

    finalUpdates.updatedAt = new Date()

    const [updatedCategory] = await db
      .update(categories)
      .set(finalUpdates)
      .where(eq(categories.id, categoryId))
      .returning()

    if (!updatedCategory) {
      return { data: null, error: 'Failed to update category' }
    }

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.siteId}`)

    return { data: updatedCategory as unknown as Category, error: null }
  } catch (error) {
    console.error('Error updating category:', error)
    return { data: null, error: 'Failed to update category' }
  }
}

/**
 * Delete a category
 */
export async function deleteCategoryAction(categoryId: string) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { success: false, error: 'Invalid category ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch category
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
    })

    if (!category) {
      return { success: false, error: 'Category not found' }
    }

    // Verify ownership via site
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Collect all descendant IDs (children, grandchildren, etc.)
    const allIdsToDelete = [categoryId]
    const queue = [categoryId]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, parentId))

      for (const child of children) {
        allIdsToDelete.push(child.id)
        queue.push(child.id)
      }
    }

    // Delete all content relationships for these categories
    await db
      .delete(contentCategoryRelationships)
      .where(inArray(contentCategoryRelationships.categoryId, allIdsToDelete))

    // Delete all categories (children first, then parent)
    await db
      .delete(categories)
      .where(inArray(categories.id, allIdsToDelete))

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting category:', error)
    return { success: false, error: 'Failed to delete category' }
  }
}

/**
 * Delete multiple categories at once (with cascading child deletion)
 */
export async function deleteCategoriesAction(categoryIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!categoryIds.length) {
      return { success: false, error: 'No categories selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of categoryIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid category ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch all selected categories and verify ownership
    const categories = await db
      .select({ id: categories.id, siteId: categories.siteId })
      .from(categories)
      .where(inArray(categories.id, categoryIds))

    if (!categories.length) {
      return { success: false, error: 'Categories not found' }
    }

    const siteIds = [...new Set(categories.map(c => c.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more categories' }
    }

    // Collect all IDs to delete including descendants
    const allIdsToDelete = new Set(categoryIds)
    const queue = [...categoryIds]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, parentId))

      for (const child of children) {
        if (!allIdsToDelete.has(child.id)) {
          allIdsToDelete.add(child.id)
          queue.push(child.id)
        }
      }
    }

    const idsArray = Array.from(allIdsToDelete)

    // Delete all content relationships
    await db
      .delete(contentCategoryRelationships)
      .where(inArray(contentCategoryRelationships.categoryId, idsArray))

    // Delete all categories
    await db
      .delete(categories)
      .where(inArray(categories.id, idsArray))

    revalidateTag('categories')

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update category blocks (for builder)
 */
export async function updateCategoryBlocksAction(categoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Validate category ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(categoryId)) {
      return { success: false, error: 'Invalid category ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch category
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
    })

    if (!category) {
      return { success: false, error: 'Category not found' }
    }

    // Verify ownership via site
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    await db
      .update(categories)
      .set({
        contentBlocks,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, categoryId))

    revalidateTag('categories')
    revalidateTag(`category-${categoryId}`)
    revalidateTag(`site-${category.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating category blocks:', error)
    return { success: false, error: 'Failed to update category blocks' }
  }
}
