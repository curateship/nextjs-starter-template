'use server'

import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites, siteDashboardPages } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

// Types for blocks
interface Block {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

export interface SiteWithUserPageBlocks {
  id: string
  name: string
  subdomain: string
  custom_domain: string | null
  settings?: {
    favicon?: string
    [key: string]: any
  }
  blocks: Block[]
  currentPage?: {
    id: string
    title: string
    slug: string
    meta_description: string | null
  }
}

/**
 * Helper function to build blocks array for user pages
 */
function buildUserPageBlocks(
  page: { contentBlocks: any }
): Block[] {
  const blocks: Block[] = []

  // Add page blocks from content_blocks
  if (page.contentBlocks) {
    const contentBlocks = page.contentBlocks as Record<string, any>
    Object.entries(contentBlocks).forEach(([blockId, blockData]: [string, any]) => {
      blocks.push({
        id: blockId,
        type: blockData.type,
        content: blockData.content || blockData,
        display_order: blockData.display_order || 0
      })
    })
  }

  return blocks
}

/**
 * Get user page by slug for frontend rendering
 */
export async function getUserPageBySlug(
  siteId: string,
  slug: string
): Promise<{ data: SiteWithUserPageBlocks | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Fetch site data
    const [site] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Site not found' }
    }

    // Determine which page to load (home or specific slug)
    const pageSlug = slug || 'home'

    // Fetch the user page
    const [page] = await db
      .select()
      .from(siteDashboardPages)
      .where(
        and(
          eq(siteDashboardPages.siteId, siteId),
          eq(siteDashboardPages.slug, pageSlug),
          eq(siteDashboardPages.isPublished, true)
        )
      )
      .limit(1)

    if (!page) {
      // If specific page not found, try to get default page
      if (pageSlug !== 'home') {
        const [defaultPage] = await db
          .select()
          .from(siteDashboardPages)
          .where(
            and(
              eq(siteDashboardPages.siteId, siteId),
              eq(siteDashboardPages.isDefault, true),
              eq(siteDashboardPages.isPublished, true)
            )
          )
          .limit(1)

        if (!defaultPage) {
          return { data: null, error: 'Page not found' }
        }

        // Use default page - build blocks with helper
        const blocks = buildUserPageBlocks(defaultPage)

        return {
          data: {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            custom_domain: site.customDomain,
            settings: site.settings as SiteWithUserPageBlocks['settings'],
            blocks,
            currentPage: {
              id: defaultPage.id,
              title: defaultPage.title,
              slug: defaultPage.slug,
              meta_description: defaultPage.metaDescription
            }
          },
          error: null
        }
      }

      return { data: null, error: 'Page not found' }
    }

    // Build blocks array with helper
    const blocks = buildUserPageBlocks(page)

    return {
      data: {
        id: site.id,
        name: site.name,
        subdomain: site.subdomain,
        custom_domain: site.customDomain,
        settings: site.settings as SiteWithUserPageBlocks['settings'],
        blocks,
        currentPage: {
          id: page.id,
          title: page.title,
          slug: page.slug,
          meta_description: page.metaDescription
        }
      },
      error: null
    }
  } catch (error: any) {
    console.error('Exception in getUserPageBySlug:', error)
    return { data: null, error: error.message || 'Failed to fetch user page' }
  }
}

/**
 * Get current user's site ID
 * Assumes user has only one site or returns the first one
 */
export async function getCurrentUserSiteId(): Promise<{ siteId: string | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { siteId: null, error: 'Authentication required' }
    }

    // Get the user's first site
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.userId, user.id))
      .limit(1)

    if (!site) {
      return { siteId: null, error: 'No site found for user' }
    }

    return { siteId: site.id, error: null }
  } catch (error: any) {
    console.error('Exception in getCurrentUserSiteId:', error)
    return { siteId: null, error: error.message || 'Failed to get user site' }
  }
}
