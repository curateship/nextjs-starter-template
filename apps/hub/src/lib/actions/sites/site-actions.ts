'use server'

import { eq, and, ne, desc } from 'drizzle-orm'
import { revalidateTag, revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface Site {
  id: string
  user_id: string
  name: string
  subdomain: string
  custom_domain: string | null
  status: 'active' | 'inactive' | 'draft' | 'suspended'
  is_template: boolean
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export type SiteWithTheme = Site

// Maps Drizzle's camelCase output to the snake_case Site interface
function normalizeSite(row: Record<string, any>): Site {
  return {
    id: row.id,
    user_id: row.userId ?? row.user_id,
    name: row.name,
    subdomain: row.subdomain,
    custom_domain: row.customDomain ?? row.custom_domain ?? null,
    status: row.status,
    is_template: row.isTemplate ?? row.is_template ?? false,
    settings: row.settings ?? {},
    created_at: row.createdAt ?? row.created_at,
    updated_at: row.updatedAt ?? row.updated_at,
  }
}

export interface CreateSiteData {
  name: string
  subdomain?: string
  custom_domain?: string | null
  status?: 'active' | 'inactive' | 'draft'
  is_template?: boolean
  settings?: Record<string, any>
  font_family?: string
  font_weights?: string[]
  secondary_font_family?: string
  secondary_font_weights?: string[]
  favicon?: string
  tracking_scripts?: string
  site_width?: 'full' | 'custom'
  custom_width?: number
  default_theme?: 'system' | 'light' | 'dark'
}

function sanitizeCustomDomain(input?: string | null): string | null {
  if (!input) return null
  let d = String(input).trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^\/+/, '')
  d = d.split('/')[0].split('?')[0].split('#')[0]
  if (!d) return null
  return d
}

export async function getAllSitesAction(): Promise<{ data: Site[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db
      .select()
      .from(sites)
      .where(and(eq(sites.userId, user.id), eq(sites.isTemplate, false)))
      .orderBy(desc(sites.createdAt))

    return { data: result.map(normalizeSite), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function createSiteAction(siteData: CreateSiteData): Promise<{ data: Site | null; error: string | null }> {
  try {
    let subdomain = siteData.subdomain || siteData.name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let subdomainSuffix = ''
    let attempts = 0
    while (attempts < 10) {
      const testSubdomain = subdomain + subdomainSuffix
      const existing = await db.query.sites.findFirst({
        where: eq(sites.subdomain, testSubdomain),
        columns: { id: true },
      })
      if (!existing) {
        subdomain = testSubdomain
        break
      }
      attempts++
      subdomainSuffix = `-${attempts}`
    }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'User not authenticated. Please log in first.' }

    const settings = {
      ...(siteData.settings || {
        site_title: siteData.name,
        analytics_enabled: false,
        seo_enabled: true
      }),
      font_family: siteData.font_family || 'playfair-display',
      font_weights: siteData.font_weights || ['400', '500', '600', '700', '800', '900'],
      secondary_font_family: siteData.secondary_font_family || 'inter',
      secondary_font_weights: siteData.secondary_font_weights || ['300', '400', '500', '600', '700'],
      favicon: siteData.favicon || null,
      default_theme: siteData.default_theme || 'system',
    }

    const [created] = await db
      .insert(sites)
      .values({
        name: siteData.name,
        userId: user.id,
        subdomain,
        status: siteData.status || 'draft',
        isTemplate: siteData.is_template || false,
        customDomain: sanitizeCustomDomain(siteData.custom_domain ?? null),
        settings,
      })
      .returning()

    if (!created) return { data: null, error: 'Failed to create site' }
    return { data: normalizeSite(created), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateSiteAction(
  siteId: string,
  updates: Partial<CreateSiteData>
): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const ownedSite = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    })
    if (!ownedSite) return { data: null, error: 'Site not found or access denied' }

    const finalUpdates: Record<string, any> = {}

    if (updates.name) finalUpdates.name = updates.name
    if (updates.status) finalUpdates.status = updates.status
    if (updates.settings) finalUpdates.settings = updates.settings
    if (updates.is_template !== undefined) finalUpdates.isTemplate = updates.is_template

    if (updates.name && !updates.subdomain) {
      let subdomain = updates.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      let subdomainSuffix = ''
      let attempts = 0
      while (attempts < 10) {
        const testSubdomain = subdomain + subdomainSuffix
        const existing = await db.query.sites.findFirst({
          where: and(eq(sites.subdomain, testSubdomain), ne(sites.id, siteId)),
          columns: { id: true },
        })
        if (!existing) {
          subdomain = testSubdomain
          break
        }
        attempts++
        subdomainSuffix = `-${attempts}`
      }
      finalUpdates.subdomain = subdomain
    } else if (updates.subdomain) {
      finalUpdates.subdomain = updates.subdomain
    }

    if (updates.hasOwnProperty('custom_domain')) {
      finalUpdates.customDomain = sanitizeCustomDomain(updates.custom_domain as any)
    }

    finalUpdates.updatedAt = new Date()

    const [updated] = await db
      .update(sites)
      .set(finalUpdates)
      .where(eq(sites.id, siteId))
      .returning()

    if (!updated) return { data: null, error: 'Failed to update site' }

    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    return { data: normalizeSite(updated), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function deleteSiteAction(siteId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) return { success: false, error: 'Invalid site ID format' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    })
    if (!site) return { success: false, error: 'Site not found or you do not have permission to delete it' }

    await db.delete(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getSiteByIdAction(siteId: string): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    })

    if (!result) return { data: null, error: 'Site not found or access denied' }
    return { data: normalizeSite(result), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function checkSubdomainAvailabilityAction(subdomain: string): Promise<{ available: boolean; suggestion?: string; error: string | null }> {
  try {
    const existing = await db.query.sites.findFirst({
      where: eq(sites.subdomain, subdomain),
      columns: { id: true },
    })

    if (!existing) return { available: true, error: null }

    let suggestion = subdomain
    let attempts = 1
    while (attempts <= 5) {
      const testSubdomain = `${subdomain}-${attempts}`
      const existingTest = await db.query.sites.findFirst({
        where: eq(sites.subdomain, testSubdomain),
        columns: { id: true },
      })
      if (!existingTest) {
        suggestion = testSubdomain
        break
      }
      attempts++
    }

    return { available: false, suggestion, error: null }
  } catch (error) {
    return { available: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function updateSitePublicPagesField(
  siteId: string,
  fieldName: 'navigation' | 'footer',
  data: Record<string, any>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true, settings: true },
    })
    if (!site) return { success: false, error: 'Site not found or access denied' }

    const currentSettings = (site.settings || {}) as Record<string, any>
    const publicPages = { ...(currentSettings.public_pages || {}) }
    if (data === null || data === undefined) {
      delete publicPages[fieldName]
    } else {
      publicPages[fieldName] = data
    }
    const updatedSettings = { ...currentSettings, public_pages: publicPages }

    await db
      .update(sites)
      .set({ settings: updatedSettings })
      .where(eq(sites.id, siteId))

    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateSiteNavigationAction(siteId: string, navigationData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSitePublicPagesField(siteId, 'navigation', navigationData)
}

export async function updateSiteFooterAction(siteId: string, footerData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSitePublicPagesField(siteId, 'footer', footerData)
}
