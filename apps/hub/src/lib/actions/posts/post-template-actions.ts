'use server'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface PostTemplate {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
  is_default: boolean
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

function rowToTemplate(row: typeof postTemplates.$inferSelect): PostTemplate {
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

export async function getPostTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: PostTemplate[] | null; total: number; error: string | null }> {
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
        .from(postTemplates)
        .where(eq(postTemplates.siteId, siteId))
        .orderBy(desc(postTemplates.isDefault), desc(postTemplates.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(postTemplates)
        .where(eq(postTemplates.siteId, siteId)),
    ])

    return { data: rows.map(rowToTemplate), total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error('getPostTemplatesBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getPostTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { ids: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { ids: [], error: 'Access denied' }
    }

    const rows = await db
      .select({ id: postTemplates.id })
      .from(postTemplates)
      .where(and(eq(postTemplates.siteId, siteId), eq(postTemplates.isDefault, false)))

    return { ids: rows.map((row) => row.id), error: null }
  } catch (err) {
    console.error('getPostTemplateIdsAction error:', err)
    return { ids: [], error: 'Server error' }
  }
}

export async function getPostTemplateById(
  templateId: string
): Promise<{ data: PostTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(postTemplates)
      .where(eq(postTemplates.id, templateId))
      .limit(1)

    if (!row) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToTemplate(row), error: null }
  } catch (err) {
    console.error('getPostTemplateById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createPostTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: PostTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Template name is required' }

    const [existingDefault] = await db
      .select({ id: postTemplates.id })
      .from(postTemplates)
      .where(and(eq(postTemplates.siteId, input.siteId), eq(postTemplates.isDefault, true)))
      .limit(1)

    const [data] = await db
      .insert(postTemplates)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        contentBlocks: input.contentBlocks || {},
        isDefault: !existingDefault,
      })
      .returning()

    if (!data) return { data: null, error: 'Failed to create template' }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error('createPostTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updatePostTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: PostTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [template] = await db
      .select({ siteId: postTemplates.siteId })
      .from(postTemplates)
      .where(eq(postTemplates.id, templateId))
      .limit(1)

    if (!template) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.name !== undefined && !updates.name.trim()) {
      return { data: null, error: 'Template name is required' }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) allowedFields.name = updates.name.trim()
    if (updates.content_blocks !== undefined) allowedFields.contentBlocks = updates.content_blocks

    const [data] = await db
      .update(postTemplates)
      .set(allowedFields)
      .where(eq(postTemplates.id, templateId))
      .returning()

    if (!data) return { data: null, error: 'Failed to update template' }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error('updatePostTemplate error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function setDefaultPostTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [template] = await db
      .select({ id: postTemplates.id, siteId: postTemplates.siteId, isDefault: postTemplates.isDefault })
      .from(postTemplates)
      .where(eq(postTemplates.id, templateId))
      .limit(1)

    if (!template) return { success: false, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    if (template.isDefault) return { success: true, error: null }

    await db.transaction(async (tx) => {
      await tx
        .update(postTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(postTemplates.siteId, template.siteId), eq(postTemplates.isDefault, true)))

      await tx
        .update(postTemplates)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(postTemplates.id, templateId))
    })

    return { success: true, error: null }
  } catch (err) {
    console.error('setDefaultPostTemplate error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function deletePostTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }

    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const templates = await db
      .select({ id: postTemplates.id, siteId: postTemplates.siteId, isDefault: postTemplates.isDefault })
      .from(postTemplates)
      .where(inArray(postTemplates.id, ids))

    if (!templates.length) return { success: false, error: 'Not found' }

    const deletableIds = templates.filter((template) => !template.isDefault).map((template) => template.id)
    if (!deletableIds.length) return { success: false, error: 'Default templates cannot be deleted' }

    const siteIds = [...new Set(templates.filter((template) => !template.isDefault).map((template) => template.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(postTemplates).where(inArray(postTemplates.id, deletableIds))

    return { success: true, error: null }
  } catch (err) {
    console.error('deletePostTemplates error:', err)
    return { success: false, error: 'Server error' }
  }
}
