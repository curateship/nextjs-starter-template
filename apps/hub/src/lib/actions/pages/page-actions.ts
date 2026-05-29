'use server'

import { eq, and, ne, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { purgeProxyCache } from '@/lib/utils/cache-purge'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface Page {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  is_homepage: boolean
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  created_at: string
  updated_at: string
}

export interface PageWithDetails extends Page {
  site_name: string
  subdomain: string
  user_id: string
  block_count: number
}

export interface CreatePageData {
  title: string
  slug?: string
  meta_description?: string
  is_homepage?: boolean
  is_published?: boolean
  content_blocks?: Record<string, any>
}

export interface UpdatePageData {
  title?: string
  slug?: string
  meta_description?: string
  is_homepage?: boolean
  is_published?: boolean
}

/**
 * Get all pages for a site
 */
export async function getSitePagesAction(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: Page[] | null; total: number; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, total: 0, error: 'Invalid site ID format' }
    }

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
      db.select({ count: sql<number>`count(*)::int` }).from(pages).where(eq(pages.siteId, siteId)),
      db.select().from(pages).where(eq(pages.siteId, siteId)).orderBy(desc(pages.displayOrder)).limit(pageSize).offset(from),
    ])

    const serialized: Page[] = data.map(p => ({
      id: p.id,
      site_id: p.siteId,
      title: p.title,
      slug: p.slug,
      meta_description: p.metaDescription,
      is_homepage: p.isHomepage,
      is_published: p.isPublished,
      display_order: p.displayOrder,
      content_blocks: (p.contentBlocks as Record<string, any>) || {},
      created_at: new Date(p.createdAt).toISOString(),
      updated_at: new Date(p.updatedAt).toISOString(),
    }))

    return { data: serialized, total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    console.error('Exception in getSitePagesAction:', error)
    return {
      data: null,
      total: 0,
      error: 'Failed to fetch pages'
    }
  }
}

/**
 * Get a single page by ID
 */
export async function getPageByIdAction(pageId: string): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the page
    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, pageId))

    if (!page) {
      return { data: null, error: 'Page not found. The database migration may not have created default pages yet.' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    const serializedPage: Page = {
      id: page.id,
      site_id: page.siteId,
      title: page.title,
      slug: page.slug,
      meta_description: page.metaDescription,
      is_homepage: page.isHomepage,
      is_published: page.isPublished,
      display_order: page.displayOrder,
      content_blocks: (page.contentBlocks as Record<string, any>) || {},
      created_at: page.createdAt ? new Date(page.createdAt).toISOString() : new Date().toISOString(),
      updated_at: page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString(),
    }

    return { data: serializedPage, error: null }
  } catch (error) {
    console.error('Exception in getPageByIdAction:', error)
    return {
      data: null,
      error: 'Failed to fetch page'
    }
  }
}


/**
 * Update an existing page
 */
export async function updatePageAction(pageId: string, updates: UpdatePageData): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the page
    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, pageId))

    if (!page) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { data: null, error: 'Site not found or access denied' }
    }

    // Validate title if being updated
    if (updates.title !== undefined && !updates.title?.trim()) {
      return { data: null, error: 'Page title cannot be empty' }
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
      const reservedSlugs = ['account', 'api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      // Check if slug conflicts with other pages (excluding current page)
      const [existingPage] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.siteId, page.siteId), eq(pages.slug, slug)))

      if (existingPage && existingPage.id !== pageId) {
        return {
          data: null,
          error: `A page with the slug "${slug}" already exists. Please choose a different slug.`
        }
      }

      processedUpdates.slug = slug
    }

    // If setting as homepage, unset any existing homepage
    if (updates.is_homepage === true) {
      await db
        .update(pages)
        .set({ isHomepage: false })
        .where(and(eq(pages.siteId, page.siteId), eq(pages.isHomepage, true), ne(pages.id, pageId)))
    }

    // Clean up the updates object
    const finalUpdates: Record<string, any> = {}
    Object.entries(processedUpdates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'title' || key === 'meta_description') {
          finalUpdates[key] = typeof value === 'string' ? value.trim() || null : value
        } else {
          finalUpdates[key] = value
        }
      }
    })

    // Map snake_case keys to Drizzle camelCase columns
    const drizzleUpdates: Record<string, any> = { updatedAt: new Date() }
    if (finalUpdates.title !== undefined) drizzleUpdates.title = finalUpdates.title
    if (finalUpdates.slug !== undefined) drizzleUpdates.slug = finalUpdates.slug
    if (finalUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalUpdates.meta_description
    if (finalUpdates.is_homepage !== undefined) drizzleUpdates.isHomepage = finalUpdates.is_homepage
    if (finalUpdates.is_published !== undefined) drizzleUpdates.isPublished = finalUpdates.is_published

    // Update the page
    const [data] = await db
      .update(pages)
      .set(drizzleUpdates)
      .where(eq(pages.id, pageId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update page' }
    }

    return { data: data as unknown as Page, error: null }
  } catch (error) {
    console.error('Exception in updatePageAction:', error)
    return {
      data: null,
      error: 'Failed to update page'
    }
  }
}

/**
 * Delete a page
 */
export async function deletePageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { success: false, error: 'Invalid page ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    // Get the page
    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, pageId))

    if (!page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Prevent deleting the home page - every site needs one
    if (page.slug === 'home') {
      return {
        success: false,
        error: 'The home page cannot be deleted. Every site requires a home page.'
      }
    }

    // Delete the page
    await db.delete(pages).where(eq(pages.id, pageId))

    return { success: true, error: null }
  } catch (error) {
    console.error('Exception in deletePageAction:', error)
    return {
      success: false,
      error: 'Failed to delete page'
    }
  }
}

/**
 * Delete multiple pages at once
 */
export async function deletePagesAction(pageIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!pageIds.length) {
      return { success: false, error: 'No pages selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of pageIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid page ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    const foundPages = await db
      .select({ id: pages.id, siteId: pages.siteId, slug: pages.slug })
      .from(pages)
      .where(inArray(pages.id, pageIds))

    if (!foundPages.length) {
      return { success: false, error: 'Pages not found' }
    }

    // Prevent deleting homepage
    if (foundPages.some(p => p.slug === 'home')) {
      return { success: false, error: 'Cannot delete the homepage. Please deselect it and try again.' }
    }

    const siteIds = [...new Set(foundPages.map(p => p.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more pages' }
    }

    await db.delete(pages).where(inArray(pages.id, pageIds))

    return { success: true, error: null }
  } catch (error) {
    console.error('Exception in deletePagesAction:', error)
    return {
      success: false,
      error: 'Failed to delete pages'
    }
  }
}

/**
 * Duplicate a page
 */
export async function duplicatePageAction(pageId: string, newTitle: string): Promise<{ data: Page | null; error: string | null }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { data: null, error: 'Invalid page ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New page title is required' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
    }

    // Get the original page
    const [originalPage] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, pageId))

    if (!originalPage) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, originalPage.siteId), eq(sites.userId, user.id)))

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
      const [existingPage] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.siteId, originalPage.siteId), eq(pages.slug, newSlug)))

      if (!existingPage) break

      newSlug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the next display order
    const [orderData] = await db
      .select({ displayOrder: pages.displayOrder })
      .from(pages)
      .where(eq(pages.siteId, originalPage.siteId))
      .orderBy(desc(pages.displayOrder))
      .limit(1)

    const nextOrder = orderData ? orderData.displayOrder + 1 : 1

    // Create the duplicate page
    const [newPage] = await db
      .insert(pages)
      .values({
        siteId: originalPage.siteId,
        title: newTitle.trim(),
        slug: newSlug,
        metaDescription: originalPage.metaDescription,
        isHomepage: false, // Never duplicate as homepage
        isPublished: originalPage.isPublished,
        displayOrder: nextOrder,
      })
      .returning()

    if (!newPage) {
      return { data: null, error: 'Failed to duplicate page' }
    }

    return { data: newPage as unknown as Page, error: null }
  } catch (error) {
    console.error('Exception in duplicatePageAction:', error)
    return {
      data: null,
      error: 'Failed to duplicate page'
    }
  }
}

/**
 * Update page content blocks (replaces the old page_blocks system)
 */
export async function updatePageBlocksAction(pageId: string, contentBlocks: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { success: false, error: 'Invalid page ID format' }
    }

    // Verify user is authenticated
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the page to verify ownership
    const [page] = await db
      .select({ id: pages.id, siteId: pages.siteId })
      .from(pages)
      .where(eq(pages.id, pageId))

    if (!page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))

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

    // Update the page content_blocks via raw SQL since content_blocks is not in the Drizzle schema
    await db.execute(
      sql`UPDATE pages SET content_blocks = ${JSON.stringify(contentBlocks)}::jsonb, updated_at = NOW() WHERE id = ${pageId}`
    )

    // Invalidate page cache since page content blocks have changed
    revalidateTag('page-lookup')
    purgeProxyCache()

    // Invalidate listing views cache if this page contains listing-views blocks
    if (contentBlocks && typeof contentBlocks === 'object') {
      const hasListingViewsBlock = Object.values(contentBlocks).some(
        block => block && typeof block === 'object' && 'type' in block && block.type === 'listing-views'
      )
      if (hasListingViewsBlock) {
        revalidateTag('listing-views')
      }
    }

    return { success: true }

  } catch (error) {
    console.error('Error updating page blocks:', error)
    return { success: false, error: 'Failed to update page blocks' }
  }
}

/**
 * Get page content blocks by block type
 */
export async function getPageBlockAction(pageId: string, blockType: string): Promise<{ success: boolean; block?: any; error?: string }> {
  try {
    // Validate page ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return { success: false, error: 'Invalid page ID format' }
    }

    // Verify user is authenticated
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the page with content_blocks and site_id via raw SQL since content_blocks is not in Drizzle schema
    const result = await db.execute(
      sql`SELECT content_blocks, site_id FROM pages WHERE id = ${pageId} LIMIT 1`
    )

    const page = result.rows?.[0] as { content_blocks: Record<string, any>; site_id: string } | undefined

    if (!page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.site_id), eq(sites.userId, user.id)))

    if (!site) {
      return { success: false, error: 'Access denied' }
    }

    const block = page.content_blocks?.[blockType] || null
    return { success: true, block }

  } catch (error) {
    console.error('Error getting page block:', error)
    return { success: false, error: 'Failed to get page block' }
  }
}
