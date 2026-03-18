'use server'

import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface NewsletterTemplate {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
  created_at: string
  updated_at: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToTemplate(row: any): NewsletterTemplate {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    content_blocks: row.contentBlocks ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

export async function getTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: NewsletterTemplate[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

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

    return { data: rows.map(rowToTemplate), total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error('getTemplatesBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getTemplateById(
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

export async function createTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: NewsletterTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

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

export async function updateTemplate(
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

export async function deleteTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const templates = await db
      .select({ id: newsletterTemplates.id, siteId: newsletterTemplates.siteId })
      .from(newsletterTemplates)
      .where(inArray(newsletterTemplates.id, ids))

    if (!templates.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(templates.map(t => t.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(newsletterTemplates).where(inArray(newsletterTemplates.id, ids))

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteTemplates error:', err)
    return { success: false, error: 'Server error' }
  }
}
