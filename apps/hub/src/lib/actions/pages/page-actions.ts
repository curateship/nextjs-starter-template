'use server'

import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { purgeProxyCache } from '@/lib/utils/cache-purge'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'

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
export async function getSitePagesAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }): Promise<{ data: Page[] | null; total: number; error: string | null }> {
  try {
    // Validate site ID format
    if (!UUID_REGEX.test(siteId)) {
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

    const { page, pageSize, offset: from } = normalizePagination(options)
    const selectedSlug = options?.selectedSlug?.trim()

    const [countResult, data, selectedRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(pages).where(eq(pages.siteId, siteId)),
      db.select().from(pages).where(eq(pages.siteId, siteId)).orderBy(desc(pages.displayOrder)).limit(pageSize).offset(from),
      selectedSlug
        ? db.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const selectedRow = selectedRows[0]
    const rows = selectedRow && !data.some((page) => page.id === selectedRow.id)
      ? [selectedRow, ...data]
      : data

    const serialized: Page[] = rows.map(p => ({
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
 * Delete a page
 */
export async function deletePageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Validate page ID format
    if (!UUID_REGEX.test(pageId)) {
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

    for (const id of pageIds) {
      if (!UUID_REGEX.test(id)) {
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
    if (!UUID_REGEX.test(pageId)) {
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
    if (!UUID_REGEX.test(pageId)) {
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

      const hasCategoriesListingBlock = Object.values(contentBlocks).some(
        block => block && typeof block === 'object' && 'type' in block && block.type === 'categories-listing'
      )
      if (hasCategoriesListingBlock) {
        revalidateTag('categories')
      }
    }

    return { success: true }

  } catch (error) {
    console.error('Error updating page blocks:', error)
    return { success: false, error: 'Failed to update page blocks' }
  }
}
