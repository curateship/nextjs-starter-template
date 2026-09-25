import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { checkSiteAccess, getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'

export interface TemplateRecord {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
  is_default: boolean
  created_at: string
  updated_at: string
}

type TemplateTable = {
  id: any
  siteId: any
  name: any
  contentBlocks: any
  isDefault: any
  createdAt: any
  updatedAt: any
}

type TemplateUpdateOptions = {
  trimNameOnUpdate?: boolean
  validateContentBlocks?: (contentBlocks: Record<string, any>) => string | null
  validateNameOnUpdate?: boolean
}

function rowToTemplate(row: any): TemplateRecord {
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


export async function getTemplatesBySite(
  table: TemplateTable,
  operation: string,
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: TemplateRecord[] | null; total: number; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { data: null, total: 0, error: access.error }

    const { page, pageSize, offset } = normalizePagination(options)

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(table as any)
        .where(eq(table.siteId, siteId))
        .orderBy(desc(table.isDefault), desc(table.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(table as any)
        .where(eq(table.siteId, siteId)),
    ])

    return { data: rows.map(rowToTemplate), total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getTemplateIds(
  table: TemplateTable,
  operation: string,
  siteId: string
): Promise<{ ids: string[]; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { ids: [], error: access.error }

    const rows = await db
      .select({ id: table.id })
      .from(table as any)
      .where(and(eq(table.siteId, siteId), eq(table.isDefault, false)))

    return { ids: rows.map((row) => row.id), error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { ids: [], error: 'Server error' }
  }
}

export async function getTemplateById(
  table: TemplateTable,
  operation: string,
  templateId: string
): Promise<{ data: TemplateRecord | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(table as any)
      .where(eq(table.id, templateId))
      .limit(1)

    if (!row) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToTemplate(row), error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { data: null, error: 'Server error' }
  }
}

export async function createTemplate(
  table: TemplateTable,
  operation: string,
  input: {
    siteId: string
    name: string
    contentBlocks?: Record<string, any>
  },
  options: TemplateUpdateOptions = {}
): Promise<{ data: TemplateRecord | null; error: string | null }> {
  try {
    const access = await checkSiteAccess(input.siteId)
    if (access.error) return { data: null, error: access.error }

    if (!input.name?.trim()) return { data: null, error: 'Template name is required' }

    const contentBlocks = input.contentBlocks || {}
    const validationError = options.validateContentBlocks?.(contentBlocks)
    if (validationError) return { data: null, error: validationError }

    const [existingDefault] = await db
      .select({ id: table.id })
      .from(table as any)
      .where(and(eq(table.siteId, input.siteId), eq(table.isDefault, true)))
      .limit(1)

    const insertedRows = await db
      .insert(table as any)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        contentBlocks,
        isDefault: !existingDefault,
      })
      .returning()
    const data = (insertedRows as any[])[0]

    if (!data) return { data: null, error: 'Failed to create template' }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateTemplate(
  table: TemplateTable,
  operation: string,
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> },
  options: TemplateUpdateOptions = {}
): Promise<{ data: TemplateRecord | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [template] = await db
      .select({ siteId: table.siteId })
      .from(table as any)
      .where(eq(table.id, templateId))
      .limit(1)

    if (!template) return { data: null, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const validateName = options.validateNameOnUpdate !== false
    if (updates.name !== undefined && validateName && !updates.name.trim()) {
      return { data: null, error: 'Template name is required' }
    }

    if (updates.content_blocks !== undefined) {
      const validationError = options.validateContentBlocks?.(updates.content_blocks)
      if (validationError) return { data: null, error: validationError }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) {
      allowedFields.name = options.trimNameOnUpdate === false ? updates.name : updates.name.trim()
    }
    if (updates.content_blocks !== undefined) allowedFields.contentBlocks = updates.content_blocks

    const updatedRows = await db
      .update(table as any)
      .set(allowedFields)
      .where(eq(table.id, templateId))
      .returning()
    const data = (updatedRows as any[])[0]

    if (!data) return { data: null, error: 'Failed to update template' }

    return { data: rowToTemplate(data), error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { data: null, error: 'Server error' }
  }
}

export async function setDefaultTemplate(
  table: TemplateTable,
  operation: string,
  templateId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [template] = await db
      .select({ id: table.id, siteId: table.siteId, isDefault: table.isDefault })
      .from(table as any)
      .where(eq(table.id, templateId))
      .limit(1)

    if (!template) return { success: false, error: 'Template not found' }

    if (!await verifySiteOwnership(template.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    if (template.isDefault) return { success: true, error: null }

    await db.transaction(async (tx) => {
      await tx
        .update(table as any)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(table.siteId, template.siteId), eq(table.isDefault, true)))

      await tx
        .update(table as any)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(table.id, templateId))
    })

    return { success: true, error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { success: false, error: 'Server error' }
  }
}

export async function deleteTemplates(
  table: TemplateTable,
  operation: string,
  ids: string[]
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }

    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const templates = await db
      .select({ id: table.id, siteId: table.siteId, isDefault: table.isDefault })
      .from(table as any)
      .where(inArray(table.id, ids))

    if (!templates.length) return { success: false, error: 'Not found' }

    const deletableTemplates = templates.filter((template) => !template.isDefault)
    const deletableIds = deletableTemplates.map((template) => template.id)
    if (!deletableIds.length) return { success: false, error: 'Default templates cannot be deleted' }

    const siteIds = [...new Set(deletableTemplates.map((template) => template.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.delete(table as any).where(inArray(table.id, deletableIds))

    return { success: true, error: null }
  } catch (err) {
    console.error(`${operation} error:`, err)
    return { success: false, error: 'Server error' }
  }
}
