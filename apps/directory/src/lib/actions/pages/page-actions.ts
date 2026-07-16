'use server'

import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import { purgeProxyCache } from '@/lib/utils/cache-purge'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  generateUniqueContentSlug,
  getNextContentDisplayOrder,
  requireOwnedContentRow,
  requireOwnedSite,
} from '@/lib/actions/content/content-action-helpers'
import {
  safeDeleteSiteSearchDocument,
  safeSyncSiteSearchDocument,
} from '@/lib/actions/site-search/site-search-index'

type PageRow = typeof pages.$inferSelect

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

/**
 * Get all pages for a site
 */
export async function getSitePagesAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }): Promise<{ data: Page[] | null; total: number; error: string | null }> {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, error: access.error }
    }

    const { pageSize, offset: from } = normalizePagination(options)
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PageRow>(pages, pageId, 'Page')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const page = access.row

    // Prevent deleting the home page - every site needs one
    if (page.slug === 'home') {
      return {
        success: false,
        error: 'The home page cannot be deleted. Every site requires a home page.'
      }
    }

    // Delete the page
    await db.delete(pages).where(eq(pages.id, pageId))
    await safeDeleteSiteSearchDocument(page.siteId, 'page', pageId)

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
    await Promise.all(foundPages.map((page) => safeDeleteSiteSearchDocument(page.siteId, 'page', page.id)))

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
    if (!newTitle?.trim()) {
      return { data: null, error: 'New page title is required' }
    }

    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PageRow>(pages, pageId, 'Page')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const originalPage = access.row

    // Unique slug + next display order via shared helpers
    const newSlug = await generateUniqueContentSlug(pages, originalPage.siteId, newTitle)
    const nextOrder = await getNextContentDisplayOrder(pages, originalPage.siteId)

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

    await safeSyncSiteSearchDocument('page', newPage)

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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<PageRow>(pages, pageId, 'Page')
    if (!access.ok) {
      return { success: false, error: access.error }
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
    await safeSyncSiteSearchDocument('page', { ...access.row, contentBlocks })

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
