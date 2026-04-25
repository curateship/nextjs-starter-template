'use server'

import { eq, and, inArray, desc, asc } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships, sites, posts, products, pages, events, directories } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  getCategoryBreadcrumbItems,
  getContentBreadcrumbItems,
  type BreadcrumbContentType,
  type FrontendBreadcrumbItem,
} from '@/lib/actions/categories/frontend-breadcrumb-actions'

export type ContentType = 'directory' | 'product' | 'post' | 'event' | 'page'

export interface ContentCategoryRelationship {
  id: string
  content_id: string
  content_type: ContentType
  category_id: string
  is_primary: boolean
  created_at: string
}

export interface CategoryInfo {
  id: string
  title: string
  slug: string
  parent_id: string | null
  parent_title?: string
  is_primary?: boolean
}

export async function getContentBreadcrumbPreviewAction(
  contentId: string,
  contentType: BreadcrumbContentType
): Promise<{ data: FrontendBreadcrumbItem[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const contentTable = getTableForContentType(contentType)
    if (!contentTable) {
      return { data: null, error: 'Invalid content type' }
    }

    const [content] = await db
      .select({
        id: contentTable.id,
        siteId: contentTable.siteId,
        title: contentTable.title,
      })
      .from(contentTable)
      .where(eq(contentTable.id, contentId))
      .limit(1)

    if (!content) {
      return { data: null, error: 'Content not found' }
    }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, content.siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    })

    if (!site) {
      return { data: null, error: 'Unauthorized' }
    }

    const breadcrumbs = await getContentBreadcrumbItems({
      siteId: content.siteId,
      contentId: content.id,
      contentType,
      currentLabel: content.title,
    })

    return { data: breadcrumbs, error: null }
  } catch (error) {
    console.error('Error getting preview breadcrumbs:', error)
    return { data: null, error: 'Failed to get preview breadcrumbs' }
  }
}

export async function getCategoryBreadcrumbPreviewAction(
  categoryId: string
): Promise<{ data: FrontendBreadcrumbItem[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const [category] = await db
      .select({
        id: categories.id,
        siteId: categories.siteId,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1)

    if (!category) {
      return { data: null, error: 'Category not found' }
    }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, category.siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    })

    if (!site) {
      return { data: null, error: 'Unauthorized' }
    }

    const breadcrumbs = await getCategoryBreadcrumbItems({
      siteId: category.siteId,
      categoryId: category.id,
    })

    return { data: breadcrumbs, error: null }
  } catch (error) {
    console.error('Error getting category preview breadcrumbs:', error)
    return { data: null, error: 'Failed to get category preview breadcrumbs' }
  }
}

/**
 * Assign a category to content
 */
export async function assignCategoryToContentAction(
  contentId: string,
  contentType: ContentType,
  categoryId: string
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch category and verify ownership
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
      columns: { id: true, siteId: true },
    })

    if (!category) {
      return { success: false, error: 'Category not found' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const contentTable = getTableForContentType(contentType)
    if (!contentTable) {
      return { success: false, error: 'Invalid content type' }
    }

    const contentRows = await db
      .select({ id: contentTable.id, siteId: contentTable.siteId })
      .from(contentTable)
      .where(eq(contentTable.id, contentId))
      .limit(1)

    const content = contentRows[0]
    if (!content) {
      return { success: false, error: 'Content not found' }
    }

    if (content.siteId !== category.siteId) {
      return { success: false, error: 'Content and category must belong to the same site' }
    }

    const existingContentRelationships = await db
      .select({
        id: contentCategoryRelationships.id,
        isPrimary: contentCategoryRelationships.isPrimary,
      })
      .from(contentCategoryRelationships)
      .where(and(
        eq(contentCategoryRelationships.contentId, contentId),
        eq(contentCategoryRelationships.contentType, contentType)
      ))

    // Check if relationship already exists
    const existingRelationship = await db.query.contentCategoryRelationships.findFirst({
      where: and(
        eq(contentCategoryRelationships.contentId, contentId),
        eq(contentCategoryRelationships.categoryId, categoryId),
        eq(contentCategoryRelationships.contentType, contentType)
      ),
      columns: { id: true },
    })

    if (existingRelationship) {
      if (!existingContentRelationships.some((relationship) => relationship.isPrimary)) {
        await db
          .update(contentCategoryRelationships)
          .set({ isPrimary: true })
          .where(eq(contentCategoryRelationships.id, existingRelationship.id))
      }

      return { success: true, error: null }
    }

    const shouldSetPrimary = !existingContentRelationships.some((relationship) => relationship.isPrimary)

    await db
      .insert(contentCategoryRelationships)
      .values({
        contentId,
        contentType,
        categoryId: categoryId,
        isPrimary: shouldSetPrimary,
      })

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`category-${categoryId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error assigning category to content:', error)
    return { success: false, error: 'Failed to assign category to content' }
  }
}

/**
 * Remove a category from content
 */
export async function removeCategoryFromContentAction(
  contentId: string,
  contentType: ContentType,
  categoryId: string
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Fetch category and verify ownership
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
      columns: { id: true, siteId: true },
    })

    if (!category) {
      return { success: false, error: 'Category not found' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const [existingRelationship] = await db
      .select({
        id: contentCategoryRelationships.id,
        isPrimary: contentCategoryRelationships.isPrimary,
      })
      .from(contentCategoryRelationships)
      .where(and(
        eq(contentCategoryRelationships.contentId, contentId),
        eq(contentCategoryRelationships.categoryId, categoryId),
        eq(contentCategoryRelationships.contentType, contentType)
      ))
      .limit(1)

    await db.transaction(async (tx) => {
      await tx
        .delete(contentCategoryRelationships)
        .where(and(
          eq(contentCategoryRelationships.contentId, contentId),
          eq(contentCategoryRelationships.categoryId, categoryId),
          eq(contentCategoryRelationships.contentType, contentType)
        ))

      if (existingRelationship?.isPrimary) {
        const [nextPrimary] = await tx
          .select({ id: contentCategoryRelationships.id })
          .from(contentCategoryRelationships)
          .where(and(
            eq(contentCategoryRelationships.contentId, contentId),
            eq(contentCategoryRelationships.contentType, contentType)
          ))
          .orderBy(asc(contentCategoryRelationships.createdAt))
          .limit(1)

        if (nextPrimary) {
          await tx
            .update(contentCategoryRelationships)
            .set({ isPrimary: true })
            .where(eq(contentCategoryRelationships.id, nextPrimary.id))
        }
      }
    })

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    revalidateTag(`category-${categoryId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error removing category from content:', error)
    return { success: false, error: 'Failed to remove category from content' }
  }
}

/**
 * Get all categories assigned to a piece of content
 */
export async function getContentCategoriesAction(contentId: string, contentType: ContentType) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get relationships for this content
    const relationships = await db
      .select({
        id: contentCategoryRelationships.id,
        categoryId: contentCategoryRelationships.categoryId,
        isPrimary: contentCategoryRelationships.isPrimary,
      })
      .from(contentCategoryRelationships)
      .where(and(
        eq(contentCategoryRelationships.contentId, contentId),
        eq(contentCategoryRelationships.contentType, contentType)
      ))
      .orderBy(asc(contentCategoryRelationships.createdAt))

    if (relationships.length === 0) {
      return { data: [], error: null }
    }

    // Fetch the category details
    const categoryIds = relationships.map(r => r.categoryId)
    const categoryRows = await db
      .select({
        id: categories.id,
        title: categories.title,
        slug: categories.slug,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(inArray(categories.id, categoryIds))

    // Collect parent IDs and fetch parent titles
    const parentIds = categoryRows.filter(c => c.parentId).map(c => c.parentId!)
    let parentTitles: Record<string, string> = {}
    if (parentIds.length > 0) {
      const parentRows = await db
        .select({ id: categories.id, title: categories.title })
        .from(categories)
        .where(inArray(categories.id, parentIds))

      parentTitles = Object.fromEntries(parentRows.map(p => [p.id, p.title]))
    }

    const categoryMap = Object.fromEntries(categoryRows.map(cat => [cat.id, cat]))
    const categoriesWithDetails = relationships.reduce<CategoryInfo[]>((result, relationship) => {
      const cat = categoryMap[relationship.categoryId]
      if (!cat) return result

      result.push({
        id: cat.id,
        title: cat.title,
        slug: cat.slug,
        parent_id: cat.parentId,
        parent_title: cat.parentId ? parentTitles[cat.parentId] : undefined,
        is_primary: relationship.isPrimary,
      })

      return result
    }, [])

    return { data: categoriesWithDetails, error: null }
  } catch (error) {
    console.error('Error getting content categories:', error)
    return { data: null, error: 'Failed to get content categories' }
  }
}

/**
 * Get categories for multiple content items in a single query
 */
export async function getBulkContentCategoriesAction(
  contentIds: string[],
  contentType: ContentType
): Promise<{ data: Record<string, CategoryInfo[]> | null; error: string | null }> {
  try {
    if (contentIds.length === 0) return { data: {}, error: null }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get all relationships for these content items
    const relationships = await db
      .select({
        contentId: contentCategoryRelationships.contentId,
        categoryId: contentCategoryRelationships.categoryId,
        isPrimary: contentCategoryRelationships.isPrimary,
      })
      .from(contentCategoryRelationships)
      .where(and(
        inArray(contentCategoryRelationships.contentId, contentIds),
        eq(contentCategoryRelationships.contentType, contentType)
      ))
      .orderBy(asc(contentCategoryRelationships.createdAt))

    if (relationships.length === 0) {
      return { data: {}, error: null }
    }

    // Fetch category details
    const categoryIds = [...new Set(relationships.map(r => r.categoryId))]
    const categoryRows = await db
      .select({
        id: categories.id,
        title: categories.title,
        slug: categories.slug,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(inArray(categories.id, categoryIds))

    const categoryMap = Object.fromEntries(categoryRows.map(c => [c.id, c]))

    // Collect unique parent IDs to batch-fetch parent titles
    const parentIds = new Set<string>()
    for (const cat of categoryRows) {
      if (cat.parentId) parentIds.add(cat.parentId)
    }

    let parentTitles: Record<string, string> = {}
    if (parentIds.size > 0) {
      const parentRows = await db
        .select({ id: categories.id, title: categories.title })
        .from(categories)
        .where(inArray(categories.id, Array.from(parentIds)))

      parentTitles = Object.fromEntries(parentRows.map(p => [p.id, p.title]))
    }

    // Group by content_id
    const result: Record<string, CategoryInfo[]> = {}
    for (const rel of relationships) {
      const cat = categoryMap[rel.categoryId]
      if (!cat) continue

      if (!result[rel.contentId]) result[rel.contentId] = []
      result[rel.contentId].push({
        id: cat.id,
        title: cat.title,
        slug: cat.slug,
        parent_id: cat.parentId,
        parent_title: cat.parentId ? parentTitles[cat.parentId] : undefined,
        is_primary: rel.isPrimary,
      })
    }

    return { data: result, error: null }
  } catch (error) {
    console.error('Error getting bulk content categories:', error)
    return { data: null, error: 'Failed to get content categories' }
  }
}

/**
 * Get all content assigned to a category
 */
export async function getCategoryContentAction(
  categoryId: string,
  contentType?: ContentType,
  limit?: number
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch category and verify ownership
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, categoryId),
      columns: { id: true, siteId: true },
    })

    if (!category) {
      return { data: null, error: 'Category not found' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, category.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const conditions = [eq(contentCategoryRelationships.categoryId, categoryId)]
    if (contentType) {
      conditions.push(eq(contentCategoryRelationships.contentType, contentType))
    }

    let query = db
      .select({
        contentId: contentCategoryRelationships.contentId,
        contentType: contentCategoryRelationships.contentType,
        isPrimary: contentCategoryRelationships.isPrimary,
        createdAt: contentCategoryRelationships.createdAt,
      })
      .from(contentCategoryRelationships)
      .where(and(...conditions))
      .orderBy(desc(contentCategoryRelationships.createdAt))
      .$dynamic()

    if (limit) {
      query = query.limit(limit)
    }

    const relationships = await query

    return { data: relationships as unknown as ContentCategoryRelationship[], error: null }
  } catch (error) {
    console.error('Error getting category content:', error)
    return { data: null, error: 'Failed to get category content' }
  }
}

/**
 * Bulk assign multiple categories to content
 */
export async function bulkAssignCategoriesToContentAction(
  contentId: string,
  contentType: ContentType,
  categoryIds: string[],
  primaryCategoryId?: string | null
) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    const contentTable = getTableForContentType(contentType)
    if (!contentTable) {
      return { success: false, error: 'Invalid content type' }
    }

    const contentRows = await db
      .select({ id: contentTable.id, siteId: contentTable.siteId })
      .from(contentTable)
      .where(eq(contentTable.id, contentId))
      .limit(1)

    const content = contentRows[0]
    if (!content) {
      return { success: false, error: 'Content not found' }
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, content.siteId),
      columns: { id: true, userId: true },
    })

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const uniqueCategoryIds = [...new Set(categoryIds)]
    const requestedPrimaryCategoryId = primaryCategoryId || null
    const resolvedPrimaryCategoryId = requestedPrimaryCategoryId && uniqueCategoryIds.includes(requestedPrimaryCategoryId)
      ? requestedPrimaryCategoryId
      : uniqueCategoryIds[0] || null

    if (uniqueCategoryIds.length > 0) {
      const categoryRows = await db
        .select({ id: categories.id, siteId: categories.siteId })
        .from(categories)
        .where(inArray(categories.id, uniqueCategoryIds))

      if (categoryRows.length !== uniqueCategoryIds.length) {
        return { success: false, error: 'One or more categories not found' }
      }

      if (categoryRows.some((category) => category.siteId !== content.siteId)) {
        return { success: false, error: 'Content and categories must belong to the same site' }
      }
    }

    const existingRelationships = await db
      .select({ categoryId: contentCategoryRelationships.categoryId })
      .from(contentCategoryRelationships)
      .where(and(
        eq(contentCategoryRelationships.contentId, contentId),
        eq(contentCategoryRelationships.contentType, contentType)
      ))

    await db.transaction(async (tx) => {
      await tx
        .delete(contentCategoryRelationships)
        .where(and(
          eq(contentCategoryRelationships.contentId, contentId),
          eq(contentCategoryRelationships.contentType, contentType)
        ))

      if (uniqueCategoryIds.length > 0) {
        const newRelationships = uniqueCategoryIds.map(catId => ({
          contentId,
          contentType,
          categoryId: catId,
          isPrimary: catId === resolvedPrimaryCategoryId,
        }))

        await tx.insert(contentCategoryRelationships).values(newRelationships)
      }
    })

    revalidateTag('content-categories')
    revalidateTag(`${contentType}-${contentId}`)
    new Set([...existingRelationships.map((relationship) => relationship.categoryId), ...uniqueCategoryIds])
      .forEach(id => revalidateTag(`category-${id}`))

    return { success: true, error: null }
  } catch (error) {
    console.error('Error bulk assigning categories:', error)
    return { success: false, error: 'Failed to bulk assign categories' }
  }
}

function getTableForContentType(contentType: ContentType) {
  const tableMap = {
    directory: directories,
    product: products,
    post: posts,
    event: events,
    page: pages,
  } as const

  return tableMap[contentType] || null
}
