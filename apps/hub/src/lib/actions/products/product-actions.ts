'use server'

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { products, sites, categories, contentCategoryRelationships } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { serializeProduct } from '@/lib/utils/content-serializer'



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

export interface ProductWithDetails extends Product {
  site_name: string
  subdomain: string
  user_id: string
}

export interface CreateProductData {
  title: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
}

export interface UpdateProductData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  meta_description?: string | null
}

/**
 * Get all products for a site
 */
export async function getSiteProductsAction(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: Product[] | null; total: number; error: string | null }> {
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
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(eq(products.siteId, siteId)),
      db.execute<{
        id: string; site_id: string; title: string; slug: string;
        is_published: boolean; display_order: number; content_blocks: Record<string, any>;
        featured_image: string | null; meta_description: string | null; created_at: string; updated_at: string;
      }>(sql`SELECT * FROM products WHERE site_id = ${siteId} ORDER BY display_order ASC LIMIT ${pageSize} OFFSET ${from}`),
    ])

    const mapped = (data.rows || []).map(serializeProduct)

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
export async function getSiteProductsWithCategoriesAction(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{
  data: Product[] | null
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

    const [countPromise, data] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(eq(products.siteId, siteId)),
      db.execute<{
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
    }>(sql`
      SELECT * FROM products
      WHERE site_id = ${siteId}
      ORDER BY display_order DESC
      LIMIT ${pageSize} OFFSET ${from}
    `),
    ])

    const countResult = countPromise[0]
    const productRows = (data.rows || []).map(serializeProduct)

    // Fetch categories via Drizzle
    let categoryMap: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]> = {}
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

/** Returns only product IDs for bulk selection — lightweight alternative to full record fetch */
export async function getProductIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) return { ids: [], error: 'Invalid site ID format' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'User not authenticated' }

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

    if (!site) return { ids: [], error: 'Site not found or access denied' }

    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.siteId, siteId))

    return { ids: rows.map(r => r.id), error: null }
  } catch (error) {
    return { ids: [], error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get a single product by ID
 */
export async function getProductByIdAction(productId: string): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    const result = await db.execute<{
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
    }>(sql`SELECT * FROM products WHERE id = ${productId} LIMIT 1`)

    const product = result.rows?.[0]
    if (!product) {
      return { data: null, error: 'Product not found' }
    }

    // Now verify the user owns the site this product belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, product.site_id), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    return { data: serializeProduct(product), error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Get a product by slug (for public access, no auth required)
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const result = await db.execute<{
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
    }>(sql`SELECT * FROM products WHERE slug = ${slug} AND is_published = true LIMIT 1`)

    const product = result.rows?.[0]
    if (!product) return null

    return serializeProduct(product)
  } catch (error) {
    console.error('Error fetching product by slug:', error)
    return null
  }
}

/**
 * Update an existing product
 */
export async function updateProductAction(productId: string, updates: UpdateProductData): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the product
    const productResult = await db.execute<{
      id: string
      site_id: string
      slug: string
    }>(sql`SELECT id, site_id, slug FROM products WHERE id = ${productId} LIMIT 1`)

    const product = productResult.rows?.[0]
    if (!product) {
      return { data: null, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, product.site_id), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Product title cannot be empty' }
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

      // Check if slug conflicts with other products (excluding current product)
      const [existingProduct] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.siteId, product.site_id), eq(products.slug, slug)))

      if (existingProduct && existingProduct.id !== productId) {
        return {
          data: null,
          error: `A product with the slug "${slug}" already exists. Please choose a different slug.`
        }
      }

      processedUpdates.slug = slug
    }

    // SECURITY: Only allow whitelisted fields to prevent content_blocks bypass
    const allowedFields = ['title', 'slug', 'is_published', 'featured_image', 'meta_description'] as const
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

    const [updated] = await db
      .update(products)
      .set(drizzleUpdates)
      .where(eq(products.id, productId))
      .returning()

    if (!updated) {
      return { data: null, error: 'Failed to update product' }
    }

    // Invalidate listing views cache since product data may have changed
    revalidateTag('listing-views')

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
export async function deleteProductAction(productId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { success: false, error: 'Invalid product ID format' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the product
    const [product] = await db
      .select({ id: products.id, siteId: products.siteId })
      .from(products)
      .where(eq(products.id, productId))

    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, product.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Delete the product
    await db.delete(products).where(eq(products.id, productId))

    // Invalidate listing views cache since a product was deleted
    revalidateTag('listing-views')

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
export async function deleteProductsAction(productIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!productIds.length) {
      return { success: false, error: 'No products selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of productIds) {
      if (!uuidRegex.test(id)) {
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

    revalidateTag('listing-views')

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
export async function duplicateProductAction(productId: string, newTitle: string): Promise<{ data: Product | null; error: string | null }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { data: null, error: 'Invalid product ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New product title is required' }
    }

    // Get the authenticated user
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original product
    const [originalProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))

    if (!originalProduct) {
      return { data: null, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, originalProduct.siteId), eq(sites.userId, user.id)))

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
      const [existingProduct] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.siteId, originalProduct.siteId), eq(products.slug, newSlug)))

      if (!existingProduct) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const [orderData] = await db
      .select({ displayOrder: products.displayOrder })
      .from(products)
      .where(eq(products.siteId, originalProduct.siteId))
      .orderBy(desc(products.displayOrder))
      .limit(1)

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

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
export async function updateProductBlocksAction(productId: string, contentBlocks: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate product ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return { success: false, error: 'Invalid product ID format' }
    }

    // Verify user is authenticated
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the product to verify ownership
    const [product] = await db
      .select({ id: products.id, siteId: products.siteId })
      .from(products)
      .where(eq(products.id, productId))

    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    // Verify user owns the site this product belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, product.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

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
    const allowedBlockTypes = ['product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot', 'product-checkout', 'product-faq', 'product-testimonials', 'listing-views', '_settings']
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

    // Invalidate listing views cache since product content may have changed
    revalidateTag('listing-views')

    return { success: true }

  } catch (error) {
    console.error('Error updating product blocks:', error)
    return { success: false, error: 'Failed to update product blocks' }
  }
}
