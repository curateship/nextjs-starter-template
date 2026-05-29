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

export interface CreateAccountPageData {
  title: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
  content_blocks?: Record<string, any>
}

export interface UpdateAccountPageData {
  title?: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
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
export async function getAccountPagesAction(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: AccountPage[] | null; total: number; error: string | null }> {
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

    const [countResult, result] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(siteAccountPages).where(eq(siteAccountPages.siteId, siteId)),
      db.select().from(siteAccountPages).where(eq(siteAccountPages.siteId, siteId)).orderBy(desc(siteAccountPages.displayOrder)).limit(pageSize).offset(from),
    ])

    return { data: result.map(toAccountPage), total: countResult[0]?.count ?? 0, error: null }
  } catch (error: any) {
    console.error('Exception in getAccountPagesAction:', error)
    return { data: null, total: 0, error: 'Failed to fetch account pages' }
  }
}

/**
 * Get a single account page by ID
 */
export async function getAccountPageAction(pageId: string): Promise<{ data: AccountPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const [page] = await db
      .select()
      .from(siteAccountPages)
      .where(eq(siteAccountPages.id, pageId))
      .limit(1)

    if (!page) {
      return { data: null, error: 'Page not found' }
    }

    // Verify user owns the site this page belongs to
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, page.siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    return { data: toAccountPage(page), error: null }
  } catch (error: any) {
    console.error('Exception in getAccountPageAction:', error)
    return { data: null, error: 'Failed to fetch account page' }
  }
}

/**
 * Create a new account page
 */
export async function createAccountPageAction(
  siteId: string,
  pageData: CreateAccountPageData
): Promise<{ data: AccountPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Verify user owns this site
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Access denied' }
    }

    // Generate slug from title if not provided
    const slug = pageData.slug || pageData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
    }

    const reservedSlugs = ['api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return { data: null, error: 'This slug is reserved and cannot be used.' }
    }

    const [existingAccountPage] = await db
      .select({ id: siteAccountPages.id })
      .from(siteAccountPages)
      .where(and(eq(siteAccountPages.siteId, siteId), eq(siteAccountPages.slug, slug)))
      .limit(1)

    if (existingAccountPage) {
      return { data: null, error: `An account page with the slug "${slug}" already exists. Please choose a different slug.` }
    }

    // Get the highest display_order for this site to append new page at the end
    const [lastPage] = await db
      .select({ displayOrder: siteAccountPages.displayOrder })
      .from(siteAccountPages)
      .where(eq(siteAccountPages.siteId, siteId))
      .orderBy(desc(siteAccountPages.displayOrder))
      .limit(1)

    const nextOrder = lastPage ? lastPage.displayOrder + 1 : 1
    const contentBlocks = pageData.content_blocks ?? {}
    const contentBlocksError = validateContentBlocks(contentBlocks)

    if (contentBlocksError) {
      return { data: null, error: contentBlocksError }
    }

    const [newPage] = await db
      .insert(siteAccountPages)
      .values({
        siteId,
        title: pageData.title,
        slug,
        metaDescription: pageData.meta_description || null,
        isDefault: pageData.is_default || false,
        isPublished: pageData.is_published !== false,
        contentBlocks,
        displayOrder: nextOrder
      })
      .returning()

    if (!newPage) {
      return { data: null, error: 'Failed to create account page' }
    }

    // Revalidate cache
    revalidateTag(`account-pages-${siteId}`)

    return { data: toAccountPage(newPage), error: null }
  } catch (error: any) {
    console.error('Exception in createAccountPageAction:', error)
    return { data: null, error: 'Failed to create account page' }
  }
}

/**
 * Update account page
 */
export async function updateAccountPageAction(
  pageId: string,
  pageData: UpdateAccountPageData
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

    // Build Drizzle updates from allowed fields
    if (pageData.slug !== undefined) {
      const slug = pageData.slug.trim()

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      const reservedSlugs = ['api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      const [conflictingAccountPage] = await db
        .select({ id: siteAccountPages.id })
        .from(siteAccountPages)
        .where(and(eq(siteAccountPages.siteId, existingPage.siteId), eq(siteAccountPages.slug, slug)))
        .limit(1)

      if (conflictingAccountPage && conflictingAccountPage.id !== pageId) {
        return { data: null, error: `An account page with the slug "${slug}" already exists. Please choose a different slug.` }
      }

      pageData.slug = slug
    }

    const drizzleUpdates: Record<string, any> = {}
    if (pageData.title !== undefined) drizzleUpdates.title = pageData.title
    if (pageData.slug !== undefined) drizzleUpdates.slug = pageData.slug
    if (pageData.meta_description !== undefined) drizzleUpdates.metaDescription = pageData.meta_description
    if (pageData.is_default !== undefined) drizzleUpdates.isDefault = pageData.is_default
    if (pageData.is_published !== undefined) drizzleUpdates.isPublished = pageData.is_published

    const [updatedPage] = await db
      .update(siteAccountPages)
      .set(drizzleUpdates)
      .where(eq(siteAccountPages.id, pageId))
      .returning()

    if (!updatedPage) {
      return { data: null, error: 'Failed to update page' }
    }

    // Revalidate cache
    revalidateTag(`account-page-${pageId}`)
    revalidateTag(`account-pages-${updatedPage.siteId}`)

    return { data: toAccountPage(updatedPage), error: null }
  } catch (error: any) {
    console.error('Exception in updateAccountPageAction:', error)
    return { data: null, error: 'Failed to update account page' }
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
 * Reorder account pages
 */
export async function reorderAccountPagesAction(
  pageUpdates: Array<{ id: string; display_order: number }>
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!Array.isArray(pageUpdates)) {
      return { success: false, error: 'Invalid reorder payload' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    if (pageUpdates.length === 0) {
      return { success: true, error: null }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const update of pageUpdates) {
      if (!update || !uuidRegex.test(update.id) || !Number.isInteger(update.display_order)) {
        return { success: false, error: 'Invalid reorder payload' }
      }
    }

    const pageIds = [...new Set(pageUpdates.map(update => update.id))]
    const pagesToReorder = await db
      .select({ id: siteAccountPages.id, siteId: siteAccountPages.siteId })
      .from(siteAccountPages)
      .where(inArray(siteAccountPages.id, pageIds))

    if (pagesToReorder.length !== pageIds.length) {
      return { success: false, error: 'Page not found' }
    }

    const siteIds = [...new Set(pagesToReorder.map(page => page.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    const pageSiteIds = new Map(pagesToReorder.map(page => [page.id, page.siteId]))

    // Update each page's display_order
    for (const update of pageUpdates) {
      const siteId = pageSiteIds.get(update.id)
      if (!siteId) {
        return { success: false, error: 'Page not found' }
      }

      await db
        .update(siteAccountPages)
        .set({ displayOrder: update.display_order })
        .where(and(eq(siteAccountPages.id, update.id), eq(siteAccountPages.siteId, siteId)))
    }

    for (const siteId of siteIds) {
      revalidateTag(`account-pages-${siteId}`)
    }

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in reorderAccountPagesAction:', error)
    return { success: false, error: 'Failed to reorder account pages' }
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
