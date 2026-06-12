'use server'

import { eq, and, desc, inArray, isNull, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { categories, categoryTemplates, contentCategoryRelationships, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import { serializeCategory } from '@/lib/utils/content-serializer'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  requireOwnedContentRow,
  requireOwnedSite,
  validateContentSlugUpdate,
} from '@/lib/actions/content/content-action-helpers'
import {
  getCategoryNonBlockEntries,
  mergeCategoryTemplateBlocks,
  pruneCategoryValueBlocksForTemplate,
} from './category-template-inheritance'
import { getDefaultCategoryTemplateIdForSite } from './category-template-ensure'

type CategoryRow = typeof categories.$inferSelect

export interface Category {
  id: string
  site_id: string
  template_id: string
  title: string
  slug: string
  parent_id: string | null
  featured_image: string | null
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
  template_id?: string
  parent_id?: string | null
  featured_image?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

export interface UpdateCategoryData {
  title?: string
  slug?: string
  template_id?: string
  parent_id?: string | null
  featured_image?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  is_published?: boolean
}

/**
 * Get all categories for a site
 */
export async function getCategoriesForSiteAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }) {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, error: access.error }
    }

    // Pagination
    const { pageSize, offset } = normalizePagination(options)
    const selectedSlug = options?.selectedSlug?.trim()

    const [categoryRows, countResult, selectedRows] = await Promise.all([
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
      selectedSlug
        ? db.select().from(categories).where(and(eq(categories.siteId, siteId), eq(categories.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const total = Number(countResult[0]?.count ?? 0)
    const selectedRow = selectedRows[0]
    const rows = selectedRow && !categoryRows.some((category) => category.id === selectedRow.id)
      ? [selectedRow, ...categoryRows]
      : categoryRows

    return { data: rows.map(serializeCategory), total, error: null }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return { data: null, total: 0, error: 'Failed to fetch categories' }
  }
}

/**
 * Get categories with assignment counts in a single action (1 auth check, parallel queries)
 */
export async function getCategoriesWithCountsAction(siteId: string, options?: { page?: number; pageSize?: number; parentSlug?: string | null }) {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, counts: {} as Record<string, number>, childCounts: {} as Record<string, number>, parentPath: [] as Category[], allCategories: [] as Category[], error: access.error }
    }

    // Pagination
    const { pageSize, offset } = normalizePagination(options)
    const parentSlug = options?.parentSlug?.trim() || null
    const parentCategory = parentSlug
      ? await db.query.categories.findFirst({
          where: and(eq(categories.siteId, siteId), eq(categories.slug, parentSlug)),
        })
      : null

    if (parentSlug && !parentCategory) {
      return { data: null, total: 0, counts: {} as Record<string, number>, childCounts: {} as Record<string, number>, parentPath: [] as Category[], allCategories: [] as Category[], error: 'Category not found' }
    }

    const parentPath: Category[] = []
    let currentParent = parentCategory
    const seenParentIds = new Set<string>()
    while (currentParent) {
      if (seenParentIds.has(currentParent.id)) {
        return { data: null, total: 0, counts: {} as Record<string, number>, childCounts: {} as Record<string, number>, parentPath: [] as Category[], allCategories: [] as Category[], error: 'Circular parent relationship detected' }
      }

      seenParentIds.add(currentParent.id)
      parentPath.unshift(serializeCategory(currentParent))
      currentParent = currentParent.parentId
        ? (await db.query.categories.findFirst({
            where: and(eq(categories.id, currentParent.parentId), eq(categories.siteId, siteId)),
          })) ?? null
        : null
    }

    const levelFilter = parentCategory
      ? and(eq(categories.siteId, siteId), eq(categories.parentId, parentCategory.id))
      : and(eq(categories.siteId, siteId), isNull(categories.parentId))

    const [categoriesResult, countResult, allCategoryRows] = await Promise.all([
      db
        .select({
          id: categories.id,
          site_id: categories.siteId,
          template_id: categories.templateId,
          title: categories.title,
          slug: categories.slug,
          parent_id: categories.parentId,
          featured_image: categories.featuredImage,
          meta_description: categories.metaDescription,
          content_blocks: categories.contentBlocks,
          is_published: categories.isPublished,
          display_order: categories.displayOrder,
          created_at: categories.createdAt,
          updated_at: categories.updatedAt,
        })
        .from(categories)
        .where(levelFilter)
        .orderBy(desc(categories.displayOrder))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(categories)
        .where(levelFilter),
      db
        .select()
        .from(categories)
        .where(eq(categories.siteId, siteId))
        .orderBy(desc(categories.displayOrder)),
    ])

    const total = Number(countResult[0]?.count ?? 0)

    // Fetch assignment counts for the returned categories
    const counts: Record<string, number> = {}
    const childCounts: Record<string, number> = {}
    const categoryIds = categoriesResult.map(c => c.id)
    if (categoryIds.length > 0) {
      const [relationships, children] = await Promise.all([
        db
          .select({ categoryId: contentCategoryRelationships.categoryId })
          .from(contentCategoryRelationships)
          .where(inArray(contentCategoryRelationships.categoryId, categoryIds)),
        db
          .select({
            parentId: categories.parentId,
            count: sql<number>`count(*)`,
          })
          .from(categories)
          .where(and(eq(categories.siteId, siteId), inArray(categories.parentId, categoryIds)))
          .groupBy(categories.parentId),
      ])

      for (const rel of relationships) {
        counts[rel.categoryId] = (counts[rel.categoryId] || 0) + 1
      }
      for (const child of children) {
        if (child.parentId) {
          childCounts[child.parentId] = Number(child.count)
        }
      }
    }

    return {
      data: categoriesResult.map(serializeCategory),
      total,
      counts,
      childCounts,
      parentPath,
      allCategories: allCategoryRows.map(serializeCategory),
      error: null
    }
  } catch (error) {
    console.error('Error fetching categories with counts:', error)
    return { data: null, total: 0, counts: {} as Record<string, number>, childCounts: {} as Record<string, number>, parentPath: [] as Category[], allCategories: [] as Category[], error: 'Failed to fetch categories' }
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
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, error: access.error }
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

    // Resolve the template: explicit choice must belong to this site,
    // otherwise fall back to the site default (ensures Blank exists)
    let templateId: string
    if (data.template_id) {
      if (!UUID_REGEX.test(data.template_id)) {
        return { data: null, error: 'Invalid template ID format' }
      }

      const template = await db.query.categoryTemplates.findFirst({
        where: and(eq(categoryTemplates.id, data.template_id), eq(categoryTemplates.siteId, siteId)),
        columns: { id: true },
      })

      if (!template) {
        return { data: null, error: 'Template not found' }
      }

      templateId = template.id
    } else {
      templateId = await getDefaultCategoryTemplateIdForSite(siteId)
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
        templateId,
        title: data.title,
        slug,
        parentId: data.parent_id || null,
        featuredImage: data.featured_image || null,
        metaDescription: data.meta_description || null,
        contentBlocks: data.content_blocks || {},
        isPublished: data.is_published ?? false,
        displayOrder: nextDisplayOrder,
      })
      .returning()

    if (!newCategory) {
      return { data: null, error: 'Failed to create category' }
    }

    revalidateTag('categories')
    revalidateTag(`site-${siteId}`)

    return { data: serializeCategory(newCategory), error: null }
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<CategoryRow>(categories, categoryId, 'Category')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const category = access.row

    // If the template is switching, load it for the value prune below
    let nextTemplateContentBlocks: Record<string, any> | null = null
    if (data.template_id !== undefined) {
      if (!UUID_REGEX.test(data.template_id)) {
        return { data: null, error: 'Invalid template ID format' }
      }

      const template = await db.query.categoryTemplates.findFirst({
        where: and(eq(categoryTemplates.id, data.template_id), eq(categoryTemplates.siteId, category.siteId)),
        columns: { id: true, contentBlocks: true },
      })

      if (!template) {
        return { data: null, error: 'Template not found' }
      }

      nextTemplateContentBlocks = (template.contentBlocks || {}) as Record<string, any>
    }

    // Validate and process slug if being updated
    if (data.slug !== undefined) {
      const slugResult = await validateContentSlugUpdate(categories, category.siteId, categoryId, data.slug, 'Category')
      if (!slugResult.ok) {
        return { data: null, error: slugResult.error }
      }
      data = { ...data, slug: slugResult.slug }
    }

    // If parent_id is being updated, verify it exists and prevent circular references
    if (data.parent_id !== undefined) {
      if (data.parent_id === categoryId) {
        return { data: null, error: 'A category cannot be its own parent' }
      }

      let currentParentId = data.parent_id
      const seenParentIds = new Set<string>()
      while (currentParentId) {
        if (currentParentId === categoryId || seenParentIds.has(currentParentId)) {
          return { data: null, error: 'Circular parent relationship detected' }
        }

        seenParentIds.add(currentParentId)
        const parentCategory = await db.query.categories.findFirst({
          where: and(eq(categories.id, currentParentId), eq(categories.siteId, category.siteId)),
          columns: { id: true, parentId: true },
        })

        if (!parentCategory) {
          return { data: null, error: 'Parent category not found' }
        }

        currentParentId = parentCategory.parentId
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
    if (data.meta_description !== undefined) {
      finalUpdates.metaDescription = typeof data.meta_description === 'string' ? data.meta_description.trim() || null : data.meta_description
    }
    if (data.content_blocks !== undefined) {
      finalUpdates.contentBlocks = data.content_blocks
    }
    if (data.template_id !== undefined) {
      // Switching templates drops values for blocks the new template lacks
      // (row settings like _settings.is_private survive the prune)
      finalUpdates.templateId = data.template_id
      finalUpdates.contentBlocks = pruneCategoryValueBlocksForTemplate(
        (finalUpdates.contentBlocks ?? category.contentBlocks ?? {}) as Record<string, any>,
        nextTemplateContentBlocks || {}
      )
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

    return { data: serializeCategory(updatedCategory), error: null }
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<CategoryRow>(categories, categoryId, 'Category')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const category = access.row

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

    for (const id of categoryIds) {
      if (!UUID_REGEX.test(id)) {
        return { success: false, error: 'Invalid category ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Fetch all selected categories and verify ownership
    const categoryRows = await db
      .select({ id: categories.id, siteId: categories.siteId })
      .from(categories)
      .where(inArray(categories.id, categoryIds))

    if (!categoryRows.length) {
      return { success: false, error: 'Categories not found' }
    }

    const siteIds = [...new Set(categoryRows.map(c => c.siteId))]
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
 * Update category block values (for builder). The template owns structure;
 * only value keys for blocks present in the template are stored on the row.
 */
export async function updateCategoryBlockValuesAction(categoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<CategoryRow>(categories, categoryId, 'Category')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const category = access.row

    const template = await db.query.categoryTemplates.findFirst({
      where: and(eq(categoryTemplates.id, category.templateId), eq(categoryTemplates.siteId, category.siteId)),
      columns: { contentBlocks: true },
    })

    if (!template) {
      return { success: false, error: 'Template not found' }
    }

    // Keep row settings (_settings.is_private etc.) from the existing row when
    // the incoming value JSON doesn't carry them, then prune against the template
    const existingSettings = getCategoryNonBlockEntries((category.contentBlocks || {}) as Record<string, any>)
    const valueBlocks = pruneCategoryValueBlocksForTemplate(
      { ...existingSettings, ...contentBlocks },
      (template.contentBlocks || {}) as Record<string, any>
    )

    await db
      .update(categories)
      .set({
        contentBlocks: valueBlocks,
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

/**
 * Get categories with template-merged content blocks (builder preview only —
 * writers must keep using the raw rows from getCategoriesForSiteAction)
 */
export async function getCategoriesWithMergedBlocksAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }) {
  const result = await getCategoriesForSiteAction(siteId, options)
  if (!result.data) return result

  try {
    // One fetch for all distinct templates referenced by the returned categories
    const templateIds = [...new Set(result.data.map((category) => category.template_id))]
    const templates = templateIds.length
      ? await db
          .select({ id: categoryTemplates.id, contentBlocks: categoryTemplates.contentBlocks })
          .from(categoryTemplates)
          .where(inArray(categoryTemplates.id, templateIds))
      : []
    const templateMap = new Map(templates.map((template) => [template.id, (template.contentBlocks || {}) as Record<string, any>]))

    return {
      ...result,
      data: result.data.map((category) => ({
        ...category,
        content_blocks: mergeCategoryTemplateBlocks(
          templateMap.get(category.template_id) || {},
          category.content_blocks || {}
        ),
      })),
    }
  } catch (error) {
    console.error('Error merging category template blocks:', error)
    return { data: null, total: 0, error: 'Failed to fetch categories' }
  }
}
