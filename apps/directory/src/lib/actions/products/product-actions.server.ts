import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import { db } from '@/lib/db'
import { products, sites, categories, contentCategoryRelationships } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { serializeProduct } from '@/lib/utils/content-serializer'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  generateUniqueContentSlug,
  getNextContentDisplayOrder,
  requireOwnedContentRow,
  requireOwnedSite,
  validateContentSlugUpdate,
} from '@/lib/actions/content/content-action-helpers'
import {
  safeDeleteSiteSearchDocument,
  safeSyncSiteSearchDocument,
} from '@/lib/actions/site-search/site-search-index'

export type ProductRow = typeof products.$inferSelect

export interface Product {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface UpdateProductData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  meta_description?: string | null
  created_at?: string
}

function revalidateProductFrontend(siteId: string, productId?: string) {
  revalidateTag('listing-views')
  revalidateTag('products')
  revalidateTag(`site-${siteId}`)
  if (productId) revalidateTag(`product-${productId}`)
}

/**
 * Get all products for a site
 */
export async function getSiteProductsActionImpl(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }): Promise<{ data: Product[] | null; total: number; error: string | null }> {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, error: access.error }
    }

    const { pageSize, offset: from } = normalizePagination(options)
    const selectedSlug = options?.selectedSlug?.trim()

    const [countResult, data, selectedRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(eq(products.siteId, siteId)),
      db.select().from(products).where(eq(products.siteId, siteId)).orderBy(asc(products.displayOrder)).limit(pageSize).offset(from),
      selectedSlug
        ? db.select().from(products).where(and(eq(products.siteId, siteId), eq(products.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const selectedRow = selectedRows[0]
    const rows = selectedRow && !data.some((product) => product.id === selectedRow.id)
      ? [selectedRow, ...data]
      : data
    const mapped = rows.map(serializeProduct)

    return { data: mapped, total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    return {
      data: null,
      total: 0,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get products with their categories in a single server action call.
 */
export async function getSiteProductsWithCategoriesActionImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{
  data: Product[] | null
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

    const [countPromise, data] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(eq(products.siteId, siteId)),
      db.select().from(products).where(eq(products.siteId, siteId)).orderBy(desc(products.displayOrder)).limit(pageSize).offset(from),
    ])

    const countResult = countPromise[0]
    const productRows = data.map(serializeProduct)

    // Fetch categories via Drizzle
    const categoryMap: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]> = {}
    if (productRows.length > 0) {
      const productIds = productRows.map(p => p.id)
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
        .innerJoin(categories, and(
          eq(categories.id, contentCategoryRelationships.categoryId),
          eq(categories.siteId, siteId),
          eq(categories.isPublished, true)
        ))
        .where(and(
          inArray(contentCategoryRelationships.contentId, productIds),
          eq(contentCategoryRelationships.contentType, 'product')
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
            .where(and(
              inArray(categories.id, Array.from(parentIds)),
              eq(categories.siteId, siteId),
              eq(categories.isPublished, true)
            ))
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

    return { data: productRows, categories: categoryMap, total: countResult?.count ?? 0, error: null }
  } catch (error) {
    return { data: null, categories: {}, total: 0, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Update an existing product
 */
export async function updateProductActionImpl(productId: string, updates: UpdateProductData): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<ProductRow>(products, productId, 'Product')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const product = access.row

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Product title cannot be empty' }
    }

    // Validate and process slug if being updated
    const processedUpdates = { ...updates }
    if (updates.slug !== undefined) {
      const slugResult = await validateContentSlugUpdate(products, product.siteId, productId, updates.slug, 'Product')
      if (!slugResult.ok) {
        return { data: null, error: slugResult.error }
      }
      processedUpdates.slug = slugResult.slug
    }

    if (updates.created_at !== undefined) {
      if (typeof updates.created_at !== 'string' || !updates.created_at.trim()) {
        return { data: null, error: 'Invalid created date' }
      }

      const createdAt = new Date(updates.created_at)
      if (Number.isNaN(createdAt.getTime())) {
        return { data: null, error: 'Invalid created date' }
      }
    }

    // SECURITY: Only allow whitelisted fields to prevent content_blocks bypass
    const allowedFields = ['title', 'slug', 'is_published', 'featured_image', 'meta_description', 'created_at'] as const
    const finalUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((processedUpdates as any)[field] !== undefined) {
        if (field === 'title') {
          finalUpdates[field] = typeof (processedUpdates as any)[field] === 'string'
            ? (processedUpdates as any)[field].trim() || null
            : (processedUpdates as any)[field]
        } else {
          finalUpdates[field] = (processedUpdates as any)[field]
        }
      }
    }

    const drizzleUpdates: Partial<typeof products.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (finalUpdates.title !== undefined) drizzleUpdates.title = finalUpdates.title
    if (finalUpdates.slug !== undefined) drizzleUpdates.slug = finalUpdates.slug
    if (finalUpdates.is_published !== undefined) drizzleUpdates.isPublished = finalUpdates.is_published
    if (finalUpdates.featured_image !== undefined) drizzleUpdates.featuredImage = finalUpdates.featured_image
    if (finalUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalUpdates.meta_description
    if (finalUpdates.created_at !== undefined) drizzleUpdates.createdAt = new Date(finalUpdates.created_at)

    const [updated] = await db
      .update(products)
      .set(drizzleUpdates)
      .where(eq(products.id, productId))
      .returning()

    if (!updated) {
      return { data: null, error: 'Failed to update product' }
    }

    await safeSyncSiteSearchDocument('product', updated)
    revalidateProductFrontend(product.siteId, productId)

    return {
      data: serializeProduct(updated),
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
 * Delete a product
 */
export async function deleteProductActionImpl(productId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<ProductRow>(products, productId, 'Product')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const product = access.row

    // Delete the product
    await db.delete(products).where(eq(products.id, productId))
    await safeDeleteSiteSearchDocument(product.siteId, 'product', productId)

    revalidateProductFrontend(product.siteId, productId)

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete multiple products at once
 */
export async function deleteProductsActionImpl(productIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!productIds.length) {
      return { success: false, error: 'No products selected' }
    }

    for (const id of productIds) {
      if (!UUID_REGEX.test(id)) {
        return { success: false, error: 'Invalid product ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    const productRows = await db
      .select({ id: products.id, siteId: products.siteId })
      .from(products)
      .where(inArray(products.id, productIds))

    if (!productRows.length) {
      return { success: false, error: 'Products not found' }
    }

    const siteIds = [...new Set(productRows.map(p => p.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more products' }
    }

    await db.delete(products).where(inArray(products.id, productIds))
    await Promise.all(productRows.map((product) => safeDeleteSiteSearchDocument(product.siteId, 'product', product.id)))

    revalidateTag('listing-views')
    revalidateTag('products')
    productRows.forEach((product) => revalidateTag(`product-${product.id}`))
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
 * Duplicate a product
 */
export async function duplicateProductActionImpl(productId: string, newTitle: string): Promise<{ data: Product | null; error: string | null }> {
  try {
    if (!newTitle?.trim()) {
      return { data: null, error: 'New product title is required' }
    }

    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<ProductRow>(products, productId, 'Product')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const originalProduct = access.row

    // Unique slug + next display order via shared helpers
    const newSlug = await generateUniqueContentSlug(products, originalProduct.siteId, newTitle)
    const nextOrder = await getNextContentDisplayOrder(products, originalProduct.siteId)

    // Create the duplicate product
    const [newProduct] = await db
      .insert(products)
      .values({
        siteId: originalProduct.siteId,
        title: newTitle.trim(),
        slug: newSlug,
        isPublished: originalProduct.isPublished,
        displayOrder: nextOrder,
        featuredImage: originalProduct.featuredImage,
        metaDescription: originalProduct.metaDescription,
        contentBlocks: originalProduct.contentBlocks || {},
      })
      .returning()

    if (!newProduct) {
      return { data: null, error: 'Failed to duplicate product' }
    }

    await safeSyncSiteSearchDocument('product', newProduct)
    revalidateProductFrontend(originalProduct.siteId, newProduct.id)

    return { data: serializeProduct(newProduct), error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update product content blocks (replaces the old product_blocks system)
 */
export async function updateProductBlocksActionImpl(productId: string, contentBlocks: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<ProductRow>(products, productId, 'Product')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const product = access.row

    // SECURITY: Validate content blocks structure and size
    if (typeof contentBlocks !== 'object' || contentBlocks === null) {
      return { success: false, error: 'Invalid content blocks format' }
    }

    // Prevent DoS: Limit JSON size (50KB max)
    const jsonSize = JSON.stringify(contentBlocks).length
    if (jsonSize > 50000) {
      return { success: false, error: 'Content blocks too large' }
    }

    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['product-hero', 'product-details', 'product-gallery', 'product-features', 'product-3-steps-feature', 'product-hotspot', 'product-checkout', 'product-lead-magnet', 'product-email-modal', 'product-just-bought', 'product-faq', 'product-testimonials', 'listing-views', '_settings']
    for (const [blockKey, blockData] of Object.entries(contentBlocks)) {
      // Validate block data structure
      if (typeof blockData !== 'object' || blockData === null) {
        return { success: false, error: `Invalid data for block type: ${blockKey}` }
      }

      if (blockKey.startsWith('_')) {
        continue
      }

      const blockType = typeof blockData.type === 'string' ? blockData.type : blockKey
      if (!allowedBlockTypes.includes(blockType)) {
        return { success: false, error: `Invalid block type: ${blockType}` }
      }
    }

    // Update the product content_blocks
    await db
      .update(products)
      .set({
        contentBlocks: contentBlocks,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
    await safeSyncSiteSearchDocument('product', { ...product, contentBlocks })

    revalidateProductFrontend(product.siteId, productId)

    return { success: true }

  } catch (error) {
    console.error('Error updating product blocks:', error)
    return { success: false, error: 'Failed to update product blocks' }
  }
}
