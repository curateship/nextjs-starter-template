import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterTemplates, sites } from '@/lib/db/schema'
import { checkSiteAccess, getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'

export interface NewsletterTemplate {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
  is_default: boolean
  created_at: string
  updated_at: string
}


function rowToTemplate(row: any): NewsletterTemplate {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    content_blocks: row.contentBlocks ?? {},
    is_default: row.isDefault ?? false,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

// Ensures a default template exists for a site, creates one if missing
async function ensureDefaultTemplate(siteId: string): Promise<void> {
  const [existing] = await db
    .select({ id: newsletterTemplates.id })
    .from(newsletterTemplates)
    .where(and(eq(newsletterTemplates.siteId, siteId), eq(newsletterTemplates.isDefault, true)))
    .limit(1)

  if (existing) return

  await db.insert(newsletterTemplates).values({
    siteId,
    name: 'Default',
    contentBlocks: {},
    isDefault: true,
  })
}

export async function getTemplatesBySiteImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: NewsletterTemplate[] | null; total: number; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { data: null, total: 0, error: access.error }

    // Ensure a default template exists for this site
    await ensureDefaultTemplate(siteId)

    const { page, pageSize, offset } = normalizePagination(options)

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(newsletterTemplates)
        .where(eq(newsletterTemplates.siteId, siteId))
        .orderBy(desc(newsletterTemplates.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterTemplates)
        .where(eq(newsletterTemplates.siteId, siteId)),
    ])

    // Sort default templates first
    const mapped = rows.map(rowToTemplate)
    mapped.sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1))
    return { data: mapped, total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error('getTemplatesBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getTemplateByIdImpl(
  templateId: string
): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(newsletterTemplates)
      .where(eq(newsletterTemplates.id, templateId))
      .limit(1)

    if (!row) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToTemplate(row), error: null }
  } catch (err) {
    console.error('getTemplateById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createTemplateImpl(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    const access = await checkSiteAccess(input.siteId)
    if (access.error) return { data: null, error: access.error }

    if (!input.name?.trim()) return { data: null, error: 'Template name is required' }

    const [data] = await db
      .insert(newsletterTemplates)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        contentBlocks: input.contentBlocks || {},
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to create template' }
    }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error('createTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateTemplateImpl(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [template] = await db
      .select({ siteId: newsletterTemplates.siteId })
      .from(newsletterTemplates)
      .where(eq(newsletterTemplates.id, templateId))
      .limit(1)

    if (!template) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.content_blocks !== undefined) allowedFields.contentBlocks = updates.content_blocks

    const [data] = await db
      .update(newsletterTemplates)
      .set(allowedFields)
      .where(eq(newsletterTemplates.id, templateId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update template' }
    }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error('updateTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

/**
 * Get the default template for a site. Creates one if it doesn't exist.
 */
async function getDefaultTemplate(
  siteId: string
): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    // Ensure a default template exists
    await ensureDefaultTemplate(siteId)

    const [row] = await db
      .select()
      .from(newsletterTemplates)
      .where(and(eq(newsletterTemplates.siteId, siteId), eq(newsletterTemplates.isDefault, true)))
      .limit(1)

    if (!row) return { data: null, error: 'No default template found' }

    return { data: rowToTemplate(row), error: null }
  } catch (err) {
    console.error('getDefaultTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Set a template as the default for its site — unsets the previous default */
export async function setDefaultTemplateImpl(templateId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [template] = await db
      .select({ siteId: newsletterTemplates.siteId })
      .from(newsletterTemplates)
      .where(eq(newsletterTemplates.id, templateId))
      .limit(1)

    if (!template) return { success: false, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    // Unset current default for this site
    await db
      .update(newsletterTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(newsletterTemplates.siteId, template.siteId), eq(newsletterTemplates.isDefault, true)))

    // Set new default
    await db
      .update(newsletterTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(newsletterTemplates.id, templateId))

    return { success: true, error: null }
  } catch (err) {
    console.error('setDefaultTemplate error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function deleteTemplatesImpl(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const templates = await db
      .select({ id: newsletterTemplates.id, siteId: newsletterTemplates.siteId, isDefault: newsletterTemplates.isDefault })
      .from(newsletterTemplates)
      .where(inArray(newsletterTemplates.id, ids))

    if (!templates.length) return { success: false, error: 'Not found' }

    // Filter out default templates — they can't be deleted
    const deletableIds = templates.filter(t => !t.isDefault).map(t => t.id)
    if (!deletableIds.length) return { success: false, error: 'Default templates cannot be deleted' }

    const siteIds = [...new Set(templates.filter(t => !t.isDefault).map(t => t.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(newsletterTemplates).where(inArray(newsletterTemplates.id, deletableIds))

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteTemplates error:', err)
    return { success: false, error: 'Server error' }
  }
}
