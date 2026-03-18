'use server'

import { eq, and, desc, sql, inArray, like } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { sites, siteDashboardPages } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface UserPage {
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

export interface CreateUserPageData {
  title: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
  content_blocks?: Record<string, any>
}

export interface UpdateUserPageData {
  title?: string
  slug?: string
  meta_description?: string
  is_default?: boolean
  is_published?: boolean
}

// =============================================================================
// USER PAGES SETTINGS ACTIONS (stored in sites.settings.user_pages)
// =============================================================================

/**
 * Update user pages navigation/footer settings in sites.settings.user_pages
 */
export async function updateUserPagesSettingsAction(
  siteId: string,
  settings: { navigation?: any; footer?: any }
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get current site settings and verify ownership
    const [site] = await db
      .select({ settings: sites.settings })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
      .limit(1)

    if (!site) {
      return { success: false, error: 'Site not found or access denied' }
    }

    // Build updated settings
    const currentSettings = (site.settings as Record<string, any>) || {}
    const userPagesSettings = currentSettings.user_pages || {}

    const updatedSettings = {
      ...currentSettings,
      user_pages: {
        ...userPagesSettings,
        ...(settings.navigation !== undefined && { navigation: settings.navigation }),
        ...(settings.footer !== undefined && { footer: settings.footer })
      }
    }

    // Update sites table
    await db
      .update(sites)
      .set({ settings: updatedSettings })
      .where(eq(sites.id, siteId))

    // Revalidate cache
    revalidateTag(`site-${siteId}`)
    revalidateTag(`user-pages-${siteId}`)

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPagesSettingsAction:', error)
    return { success: false, error: error.message || 'Failed to update user pages settings' }
  }
}

// =============================================================================
// USER PAGES ACTIONS
// =============================================================================

/**
 * Get all user pages for a site
 */
export async function getUserPagesAction(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: UserPage[] | null; total: number; error: string | null }> {
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

    // Get count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.siteId, siteId))

    // Get pages
    const result = await db
      .select()
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.siteId, siteId))
      .orderBy(desc(siteDashboardPages.displayOrder))
      .limit(pageSize)
      .offset(from)

    return { data: (result as unknown as UserPage[]) || [], total: countResult?.count ?? 0, error: null }
  } catch (error: any) {
    console.error('Exception in getUserPagesAction:', error)
    return { data: null, total: 0, error: error.message || 'Failed to fetch user pages' }
  }
}

/**
 * Get a single user page by ID
 */
export async function getUserPageAction(pageId: string): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const [page] = await db
      .select()
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.id, pageId))
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

    return { data: page as unknown as UserPage, error: null }
  } catch (error: any) {
    console.error('Exception in getUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to fetch user page' }
  }
}

/**
 * Create a new user page
 */
export async function createUserPageAction(
  siteId: string,
  pageData: CreateUserPageData
): Promise<{ data: UserPage | null; error: string | null }> {
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

    // Get the highest display_order for this site to append new page at the end
    const [lastPage] = await db
      .select({ displayOrder: siteDashboardPages.displayOrder })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.siteId, siteId))
      .orderBy(desc(siteDashboardPages.displayOrder))
      .limit(1)

    const nextOrder = lastPage ? lastPage.displayOrder + 1 : 1

    const [newPage] = await db
      .insert(siteDashboardPages)
      .values({
        siteId,
        title: pageData.title,
        slug,
        metaDescription: pageData.meta_description || null,
        isDefault: pageData.is_default || false,
        isPublished: pageData.is_published !== false,
        contentBlocks: pageData.content_blocks || {},
        displayOrder: nextOrder
      })
      .returning()

    if (!newPage) {
      return { data: null, error: 'Failed to create user page' }
    }

    // Revalidate cache
    revalidateTag(`user-pages-${siteId}`)

    return { data: newPage as unknown as UserPage, error: null }
  } catch (error: any) {
    console.error('Exception in createUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to create user page' }
  }
}

/**
 * Update a user page
 */
export async function updateUserPageAction(
  pageId: string,
  pageData: UpdateUserPageData
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch page to verify ownership
    const [existingPage] = await db
      .select({ siteId: siteDashboardPages.siteId })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.id, pageId))
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
    const drizzleUpdates: Record<string, any> = {}
    if (pageData.title !== undefined) drizzleUpdates.title = pageData.title
    if (pageData.slug !== undefined) drizzleUpdates.slug = pageData.slug
    if (pageData.meta_description !== undefined) drizzleUpdates.metaDescription = pageData.meta_description
    if (pageData.is_default !== undefined) drizzleUpdates.isDefault = pageData.is_default
    if (pageData.is_published !== undefined) drizzleUpdates.isPublished = pageData.is_published

    const [updatedPage] = await db
      .update(siteDashboardPages)
      .set(drizzleUpdates)
      .where(eq(siteDashboardPages.id, pageId))
      .returning()

    if (!updatedPage) {
      return { data: null, error: 'Failed to update page' }
    }

    // Revalidate cache
    revalidateTag(`user-page-${pageId}`)
    revalidateTag(`user-pages-${updatedPage.siteId}`)

    return { data: updatedPage as unknown as UserPage, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to update user page' }
  }
}

/**
 * Delete a user page
 */
export async function deleteUserPageAction(pageId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get page to verify ownership and find site_id for cache revalidation
    const [page] = await db
      .select({ siteId: siteDashboardPages.siteId })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.id, pageId))
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

    await db.delete(siteDashboardPages).where(eq(siteDashboardPages.id, pageId))

    // Revalidate cache
    revalidateTag(`user-pages-${page.siteId}`)
    revalidateTag(`user-page-${pageId}`)

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in deleteUserPageAction:', error)
    return { success: false, error: error.message || 'Failed to delete user page' }
  }
}

/**
 * Delete multiple user pages at once
 */
export async function deleteUserPagesAction(pageIds: string[]): Promise<{ success: boolean; error: string | null }> {
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
      .select({ id: siteDashboardPages.id, siteId: siteDashboardPages.siteId, isDefault: siteDashboardPages.isDefault })
      .from(siteDashboardPages)
      .where(inArray(siteDashboardPages.id, pageIds))

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

    await db.delete(siteDashboardPages).where(inArray(siteDashboardPages.id, pageIds))

    for (const siteId of siteIds) {
      revalidateTag(`user-pages-${siteId}`)
    }
    for (const pageId of pageIds) {
      revalidateTag(`user-page-${pageId}`)
    }

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Update user page content blocks
 */
export async function updateUserPageBlocksAction(
  pageId: string,
  contentBlocks: Record<string, any>
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch page to verify ownership
    const [existingPage] = await db
      .select({ siteId: siteDashboardPages.siteId })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.id, pageId))
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

    const [updatedPage] = await db
      .update(siteDashboardPages)
      .set({ contentBlocks })
      .where(eq(siteDashboardPages.id, pageId))
      .returning()

    if (!updatedPage) {
      return { data: null, error: 'Failed to update page blocks' }
    }

    // Revalidate cache
    revalidateTag(`user-page-${pageId}`)
    revalidateTag(`user-pages-${updatedPage.siteId}`)

    return { data: updatedPage as unknown as UserPage, error: null }
  } catch (error: any) {
    console.error('Exception in updateUserPageBlocksAction:', error)
    return { data: null, error: error.message || 'Failed to update user page blocks' }
  }
}

/**
 * Reorder user pages
 */
export async function reorderUserPagesAction(
  pageUpdates: Array<{ id: string; display_order: number }>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Verify ownership via first page
    if (pageUpdates.length > 0) {
      const [firstPage] = await db
        .select({ siteId: siteDashboardPages.siteId })
        .from(siteDashboardPages)
        .where(eq(siteDashboardPages.id, pageUpdates[0].id))
        .limit(1)

      if (!firstPage) {
        return { success: false, error: 'Page not found' }
      }

      const [site] = await db
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, firstPage.siteId), eq(sites.userId, user.id)))
        .limit(1)

      if (!site) {
        return { success: false, error: 'Access denied' }
      }
    }

    // Update each page's display_order
    for (const update of pageUpdates) {
      await db
        .update(siteDashboardPages)
        .set({ displayOrder: update.display_order })
        .where(eq(siteDashboardPages.id, update.id))
    }

    // Get site_id for cache revalidation
    if (pageUpdates.length > 0) {
      const [page] = await db
        .select({ siteId: siteDashboardPages.siteId })
        .from(siteDashboardPages)
        .where(eq(siteDashboardPages.id, pageUpdates[0].id))
        .limit(1)

      if (page) {
        revalidateTag(`user-pages-${page.siteId}`)
      }
    }

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception in reorderUserPagesAction:', error)
    return { success: false, error: error.message || 'Failed to reorder user pages' }
  }
}

/**
 * Duplicate a user page
 */
export async function duplicateUserPageAction(
  pageId: string,
  newTitle: string
): Promise<{ data: UserPage | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the original page
    const [originalPage] = await db
      .select()
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.id, pageId))
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
      .select({ slug: siteDashboardPages.slug })
      .from(siteDashboardPages)
      .where(and(eq(siteDashboardPages.siteId, originalPage.siteId), like(siteDashboardPages.slug, `${baseSlug}%`)))

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
      .select({ displayOrder: siteDashboardPages.displayOrder })
      .from(siteDashboardPages)
      .where(eq(siteDashboardPages.siteId, originalPage.siteId))
      .orderBy(desc(siteDashboardPages.displayOrder))
      .limit(1)

    const nextOrder = lastPage ? lastPage.displayOrder + 1 : 1

    // Create the duplicate
    const [newPage] = await db
      .insert(siteDashboardPages)
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
    revalidateTag(`user-pages-${originalPage.siteId}`)

    return { data: newPage as unknown as UserPage, error: null }
  } catch (error: any) {
    console.error('Exception in duplicateUserPageAction:', error)
    return { data: null, error: error.message || 'Failed to duplicate user page' }
  }
}
