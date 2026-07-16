'use server'

import { eq, and, desc, sql } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'
import type { Site } from '@/lib/actions/sites/site-actions'
import { db } from '@/lib/db'
import { sites, pages } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

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

/**
 * Get all template sites owned by the current user.
 */
export async function getTemplateSitesAction(): Promise<{ data: Site[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db
      .select()
      .from(sites)
      .where(and(eq(sites.userId, user.id), eq(sites.isTemplate, true)))
      .orderBy(desc(sites.createdAt))

    return { data: result.map(normalizeSite), error: null }
  } catch (error) {
    return {
      data: null,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Apply a template's settings and pages to a target site.
 * Replaces settings (preserving tracking_scripts and maintenance), nav, footer, and all pages.
 */
export async function applyThemeToSiteAction(
  siteId: string,
  templateId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    // Verify user owns both sites
    const [targetSite, templateSite] = await Promise.all([
      db.query.sites.findFirst({
        where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      }),
      db.query.sites.findFirst({
        where: and(eq(sites.id, templateId), eq(sites.userId, user.id), eq(sites.isTemplate, true)),
      }),
    ])

    if (!targetSite) return { success: false, error: 'Target site not found or access denied' }
    if (!templateSite) return { success: false, error: 'Template not found or access denied' }

    // Merge settings — preserve site-specific fields
    const templateSettings = templateSite.settings as Record<string, any>
    const targetSettings = targetSite.settings as Record<string, any>
    const mergedSettings = {
      ...templateSettings,
      tracking_scripts: targetSettings?.tracking_scripts,
      maintenance: targetSettings?.maintenance,
      site_title: targetSettings?.site_title || targetSite.name,
    }

    // Update target site settings, including shared navigation/footer
    await db
      .update(sites)
      .set({
        settings: mergedSettings,
        updatedAt: new Date(),
      })
      .where(eq(sites.id, siteId))

    // Delete existing pages on target site
    await db.delete(pages).where(eq(pages.siteId, siteId))

    // Clone template pages to target site (use raw SQL to include content_blocks)
    const templatePages = await db.execute<{
      title: string
      slug: string
      meta_description: string | null
      is_homepage: boolean
      is_published: boolean
      display_order: number
      content_blocks: Record<string, any>
    }>(sql`SELECT title, slug, meta_description, is_homepage, is_published, display_order, content_blocks FROM pages WHERE site_id = ${templateId} ORDER BY display_order ASC`)

    if (templatePages.rows && templatePages.rows.length > 0) {
      for (const page of templatePages.rows) {
        await db.execute(
          sql`INSERT INTO pages (site_id, title, slug, meta_description, is_homepage, is_published, display_order, content_blocks)
              VALUES (${siteId}, ${page.title}, ${page.slug}, ${page.meta_description}, ${page.is_homepage}, ${page.is_published}, ${page.display_order}, ${JSON.stringify(page.content_blocks || {})}::jsonb)`
        )
      }
    }

    revalidatePath('/', 'layout')
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Delete a template site (cascades to its pages).
 */
export async function deleteTemplateAction(
  templateId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const result = await db
      .delete(sites)
      .where(and(eq(sites.id, templateId), eq(sites.userId, user.id), eq(sites.isTemplate, true)))
      .returning({ id: sites.id })

    if (result.length === 0) {
      return { success: false, error: 'Failed to delete template: not found or access denied' }
    }

    revalidatePath('/admin/themes')
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
