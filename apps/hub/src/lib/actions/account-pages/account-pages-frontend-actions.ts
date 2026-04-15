'use server'

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites, siteAccountPages } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { isSupportedAccountPageBlockType } from '@/lib/constants/account-page-block-types'
import { touchSiteMembershipActivity } from '@/lib/site-memberships/site-membership-runtime'
import { getAccountPagePath } from '@/lib/utils/account-page-path'

// Types for blocks
interface Block {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

interface AccountPageRecord {
  id: string
  title: string
  slug: string
  metaDescription: string | null
  contentBlocks: unknown
  isDefault: boolean
  displayOrder: number
}

export interface SiteWithAccountPageBlocks {
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
 * Helper function to build blocks array for account pages
 */
function buildAccountPageBlocks(
  page: { contentBlocks: any }
): Block[] {
  const blocks: Block[] = []

  // Add page blocks from content_blocks
  if (page.contentBlocks) {
    const contentBlocks = page.contentBlocks as Record<string, any>
    Object.entries(contentBlocks).forEach(([blockId, blockData]: [string, any]) => {
      if (!isSupportedAccountPageBlockType(blockData?.type)) return

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

function pageHasAuthBlock(contentBlocks: unknown) {
  if (!contentBlocks || typeof contentBlocks !== 'object') return false

  return Object.values(contentBlocks).some((block: any) => block?.type === 'auth')
}

function buildAccountPageResponse(site: any, page: AccountPageRecord): SiteWithAccountPageBlocks {
  return {
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    custom_domain: site.customDomain,
    settings: site.settings as SiteWithAccountPageBlocks['settings'],
    blocks: buildAccountPageBlocks(page),
    currentPage: {
      id: page.id,
      title: page.title,
      slug: page.slug,
      meta_description: page.metaDescription,
    },
  }
}

async function getPublishedAccountPages(siteId: string) {
  return db
    .select({
      id: siteAccountPages.id,
      title: siteAccountPages.title,
      slug: siteAccountPages.slug,
      metaDescription: siteAccountPages.metaDescription,
      contentBlocks: siteAccountPages.contentBlocks,
      isDefault: siteAccountPages.isDefault,
      displayOrder: siteAccountPages.displayOrder,
    })
    .from(siteAccountPages)
    .where(and(eq(siteAccountPages.siteId, siteId), eq(siteAccountPages.isPublished, true)))
    .orderBy(desc(siteAccountPages.isDefault), asc(siteAccountPages.displayOrder), asc(siteAccountPages.createdAt))
}

function pickPreferredAccountPagePath(
  pages: AccountPageRecord[],
  matcher: (page: AccountPageRecord) => boolean
) {
  const match = pages.find(matcher)
  return match ? getAccountPagePath(match.slug) : null
}

/**
 * Get account page by slug for frontend rendering
 */
export async function getAccountPageBySlug(
  siteId: string,
  slug: string
): Promise<{ data: SiteWithAccountPageBlocks | null; error: string | null; isAuthPage: boolean }> {
  try {
    const [site] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site) {
      return { data: null, error: 'Site not found', isAuthPage: false }
    }

    const [page] = await db
      .select({
        id: siteAccountPages.id,
        title: siteAccountPages.title,
        slug: siteAccountPages.slug,
        metaDescription: siteAccountPages.metaDescription,
        contentBlocks: siteAccountPages.contentBlocks,
        isDefault: siteAccountPages.isDefault,
        displayOrder: siteAccountPages.displayOrder,
      })
      .from(siteAccountPages)
      .where(
        and(
          eq(siteAccountPages.siteId, siteId),
          eq(siteAccountPages.slug, slug),
          eq(siteAccountPages.isPublished, true)
        )
      )
      .limit(1)

    if (!page) {
      return { data: null, error: 'Page not found', isAuthPage: false }
    }

    const isAuthPage = pageHasAuthBlock(page.contentBlocks)

    if (!isAuthPage) {
      const user = await getAuthenticatedUser()
      if (!user) {
        return { data: null, error: 'Authentication required', isAuthPage: false }
      }

      await touchSiteMembershipActivity(siteId, user.id)
    }

    return {
      data: buildAccountPageResponse(site, page),
      error: null,
      isAuthPage,
    }
  } catch (error: any) {
    console.error('Exception in getAccountPageBySlug:', error)
    return { data: null, error: error.message || 'Failed to fetch account page', isAuthPage: false }
  }
}

export async function getDefaultAccountPagePath(
  siteId: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    const pages = await getPublishedAccountPages(siteId)
    const path =
      pickPreferredAccountPagePath(pages as AccountPageRecord[], (page) => page.isDefault && !pageHasAuthBlock(page.contentBlocks)) ||
      pickPreferredAccountPagePath(pages as AccountPageRecord[], (page) => !pageHasAuthBlock(page.contentBlocks))

    return { path, error: null }
  } catch (error: any) {
    console.error('Exception in getDefaultAccountPagePath:', error)
    return { path: null, error: error.message || 'Failed to resolve default account page' }
  }
}

export async function getPublicAuthPagePath(
  siteId: string
): Promise<{ path: string | null; error: string | null }> {
  try {
    const pages = await getPublishedAccountPages(siteId)
    const path =
      pickPreferredAccountPagePath(pages as AccountPageRecord[], (page) => page.isDefault && pageHasAuthBlock(page.contentBlocks)) ||
      pickPreferredAccountPagePath(pages as AccountPageRecord[], (page) => pageHasAuthBlock(page.contentBlocks))

    return { path, error: null }
  } catch (error: any) {
    console.error('Exception in getPublicAuthPagePath:', error)
    return { path: null, error: error.message || 'Failed to resolve auth page' }
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
