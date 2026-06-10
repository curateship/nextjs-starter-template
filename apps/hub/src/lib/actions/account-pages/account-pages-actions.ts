'use server'

import { eq, and, desc, sql, inArray, like } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { sites, siteAccountPages } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { validateContentBlocks } from '@/lib/utils/content-block-validation'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface AccountPage {
  id: string
  site_id: string
  title: string
  slug: string
  meta_description: string | null
  content_blocks: Record<string, any>
  display_order: number
  is_default: boolean
  is_published: boolean
  created_at: string
  updated_at: string
}

function toAccountPage(row: any): AccountPage {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    slug: row.slug,
    meta_description: row.metaDescription ?? null,
    content_blocks: row.contentBlocks ?? {},
    display_order: row.displayOrder,
    is_default: row.isDefault,
    is_published: row.isPublished,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ''),
  }
}

/**
 * Get all account pages for a site
 */
export async function getAccountPagesAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }): Promise<{ data: AccountPage[] | null; total: number; error: string | null }> {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, total: 0, error: 'Invalid site ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, error: 'Authentication required' }
    }

    // Verify user owns this site
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const selectedSlug = options?.selectedSlug?.trim()

    const [countResult, result, selectedRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(siteAccountPages).where(eq(siteAccountPages.siteId, siteId)),
      db.select().from(siteAccountPages).where(eq(siteAccountPages.siteId, siteId)).orderBy(desc(siteAccountPages.displayOrder)).limit(pageSize).offset(from),
      selectedSlug
        ? db.select().from(siteAccountPages).where(and(eq(siteAccountPages.siteId, siteId), eq(siteAccountPages.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const selectedRow = selectedRows[0]
    const rows = selectedRow && !result.some((page) => page.id === selectedRow.id)
      ? [selectedRow, ...result]
      : result

    return { data: rows.map(toAccountPage), total: countResult[0]?.count ?? 0, error: null }
  } catch (error: any) {
    console.error('Exception in getAccountPagesAction:', error)
    return { data: null, total: 0, error: 'Failed to fetch account pages' }
  }
}

/**
 * Delete account page
 */
export async function deleteAccountPageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get page to verify ownership and find site_id for cache revalidation
    const [page] = await db
      .select({ siteId: siteAccountPages.siteId })
      .from(siteAccountPages)
      .where(eq(siteAccountPages.id, pageId))
      .limit(1)

    if (!page) {
      return { success: false, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(siteAccountPages).where(eq(siteAccountPages.id, pageId))

    // Revalidate cache
    revalidateTag(`account-pages-${page.siteId}`)
    revalidateTag(`account-page-${pageId}`)

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in deleteAccountPageAction:', error)
    return { success: false, error: 'Failed to delete account page' }
  }
}

/**
 * Delete multiple account pages at once
 */
export async function deleteAccountPagesAction(pageIds: string[]): Promise<{ success: boolean; error: string | null }> {
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
      return { success: false, error: 'Authentication required' }
    }

    const pages = await db
      .select({ id: siteAccountPages.id, siteId: siteAccountPages.siteId, isDefault: siteAccountPages.isDefault })
      .from(siteAccountPages)
      .where(inArray(siteAccountPages.id, pageIds))

    if (!pages.length) {
      return { success: false, error: 'Pages not found' }
    }

    if (pages.some(p => p.isDefault)) {
      return { success: false, error: 'Cannot delete the default page. Please deselect it and try again.' }
    }

    const siteIds = [...new Set(pages.map(p => p.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more pages' }
    }

    await db.delete(siteAccountPages).where(inArray(siteAccountPages.id, pageIds))

    for (const siteId of siteIds) {
      revalidateTag(`account-pages-${siteId}`)
    }
    for (const pageId of pageIds) {
      revalidateTag(`account-page-${pageId}`)
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('Exception in deleteAccountPagesAction:', error)
    return {
      success: false,
      error: 'Failed to delete account pages'
    }
  }
}

/**
 * Update account page content blocks
 */
export async function updateAccountPageBlocksAction(
  pageId: string,
  contentBlocks: Record<string, any>
): Promise<{ data: AccountPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch page to verify ownership
    const [existingPage] = await db
      .select({ siteId: siteAccountPages.siteId })
      .from(siteAccountPages)
      .where(eq(siteAccountPages.id, pageId))
      .limit(1)

    if (!existingPage) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, existingPage.siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    const contentBlocksError = validateContentBlocks(contentBlocks)
    if (contentBlocksError) {
      return { data: null, error: contentBlocksError }
    }

    const [updatedPage] = await db
      .update(siteAccountPages)
      .set({ contentBlocks })
      .where(eq(siteAccountPages.id, pageId))
      .returning()

    if (!updatedPage) {
      return { data: null, error: 'Failed to update page blocks' }
    }

    // Revalidate cache
    revalidateTag(`account-page-${pageId}`)
    revalidateTag(`account-pages-${updatedPage.siteId}`)

    return { data: toAccountPage(updatedPage), error: null }
  } catch (error: any) {
    console.error('Exception in updateAccountPageBlocksAction:', error)
    return { data: null, error: 'Failed to update account page blocks' }
  }
}

/**
 * Duplicate account page
 */
export async function duplicateAccountPageAction(
  pageId: string,
  newTitle: string
): Promise<{ data: AccountPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the original page
    const [originalPage] = await db
      .select()
      .from(siteAccountPages)
      .where(eq(siteAccountPages.id, pageId))
      .limit(1)

    if (!originalPage) {
      return { data: null, error: 'Original page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, originalPage.siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Generate unique slug from new title
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Check for existing slugs and append number if needed
    const existingPages = await db
      .select({ slug: siteAccountPages.slug })
      .from(siteAccountPages)
      .where(and(eq(siteAccountPages.siteId, originalPage.siteId), like(siteAccountPages.slug, `${baseSlug}%`)))

    let slug = baseSlug
    if (existingPages.length > 0) {
      const existingSlugs = existingPages.map(p => p.slug)
      let counter = 1
      while (existingSlugs.includes(slug)) {
        slug = `${baseSlug}-${counter}`
        counter++
      }
    }

    // Get the highest display_order to append at the end
    const [lastPage] = await db
      .select({ displayOrder: siteAccountPages.displayOrder })
      .from(siteAccountPages)
      .where(eq(siteAccountPages.siteId, originalPage.siteId))
      .orderBy(desc(siteAccountPages.displayOrder))
      .limit(1)

    const nextOrder = lastPage ? lastPage.displayOrder + 1 : 1

    // Create the duplicate
    const [newPage] = await db
      .insert(siteAccountPages)
      .values({
        siteId: originalPage.siteId,
        title: newTitle,
        slug,
        metaDescription: originalPage.metaDescription,
        isDefault: false, // Duplicate is never default
        isPublished: false, // Start as draft
        contentBlocks: originalPage.contentBlocks,
        displayOrder: nextOrder
      })
      .returning()

    if (!newPage) {
      return { data: null, error: 'Failed to duplicate page' }
    }

    // Revalidate cache
    revalidateTag(`account-pages-${originalPage.siteId}`)

    return { data: toAccountPage(newPage), error: null }
  } catch (error: any) {
    console.error('Exception in duplicateAccountPageAction:', error)
    return { data: null, error: 'Failed to duplicate account page' }
  }
}
