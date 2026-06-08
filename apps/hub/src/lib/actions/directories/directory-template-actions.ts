'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { directories, directoryTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { sanitizeDirectoryTemplateBlocks } from './directory-template-inheritance'
import { ensureDirectoryBlankTemplateForSite } from './directory-template-ensure'
import {
  createTemplate,
  deleteTemplates,
  getTemplateById,
  getTemplateIds,
  getTemplatesBySite,
  setDefaultTemplate,
  updateTemplate,
  type TemplateRecord,
} from '@/lib/actions/templates/template-action-helpers'

export type DirectoryTemplate = TemplateRecord

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return Boolean(site)
}

async function ensureOwnedDirectoryBlankTemplate(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return 'Invalid site ID'

  const user = await getAuthenticatedUser()
  if (!user) return 'Not authenticated'

  if (!await verifySiteOwnership(siteId, user.id)) {
    return 'Access denied'
  }

  await ensureDirectoryBlankTemplateForSite(siteId)
  return null
}

export async function getDirectoryTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: DirectoryTemplate[] | null; total: number; error: string | null }> {
  const ensureError = await ensureOwnedDirectoryBlankTemplate(siteId)
  if (ensureError) return { data: null, total: 0, error: ensureError }

  return getTemplatesBySite(directoryTemplates, 'getDirectoryTemplatesBySite', siteId, options)
}

export async function getDirectoryTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(directoryTemplates, 'getDirectoryTemplateIdsAction', siteId)
}

export async function getDirectoryTemplateById(
  templateId: string
): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  return getTemplateById(directoryTemplates, 'getDirectoryTemplateById', templateId)
}

export async function createDirectoryTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  const result = await createTemplate(directoryTemplates, 'createDirectoryTemplate', {
    ...input,
    contentBlocks: sanitizeDirectoryTemplateBlocks(input.contentBlocks || {}),
  })
  if (result.data) {
    revalidateTag('directory')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function updateDirectoryTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  const sanitizedUpdates = updates.content_blocks === undefined
    ? updates
    : {
        ...updates,
        content_blocks: sanitizeDirectoryTemplateBlocks(updates.content_blocks),
      }

  const result = await updateTemplate(directoryTemplates, 'updateDirectoryTemplate', templateId, sanitizedUpdates, {
    trimNameOnUpdate: false,
    validateNameOnUpdate: false,
  })
  if (result.data) {
    revalidateTag('directory')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function setDefaultDirectoryTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  const result = await setDefaultTemplate(directoryTemplates, 'setDefaultDirectoryTemplate', templateId)
  if (result.success) revalidateTag('directory')
  return result
}

export async function deleteDirectoryTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  if (!ids.length) return { success: false, error: 'No items selected' }
  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return { success: false, error: 'Invalid ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const templates = await db
    .select({
      id: directoryTemplates.id,
      siteId: directoryTemplates.siteId,
      isDefault: directoryTemplates.isDefault,
    })
    .from(directoryTemplates)
    .where(inArray(directoryTemplates.id, ids))

  if (!templates.length) return { success: false, error: 'Not found' }

  const siteIds = [...new Set(templates.map((template) => template.siteId))]
  const ownsAllSites = await Promise.all(siteIds.map((siteId) => verifySiteOwnership(siteId, user.id)))
  if (!ownsAllSites.every(Boolean)) {
    return { success: false, error: 'Access denied' }
  }

  const deletableTemplateIds = templates
    .filter((template) => !template.isDefault)
    .map((template) => template.id)

  if (!deletableTemplateIds.length) {
    return { success: false, error: 'Default templates cannot be deleted' }
  }

  const [usedTemplate] = await db
    .select({ id: directories.templateId })
    .from(directories)
    .where(inArray(directories.templateId, deletableTemplateIds))
    .limit(1)

  if (usedTemplate) {
    return { success: false, error: 'Template is used by one or more listings' }
  }

  const result = await deleteTemplates(directoryTemplates, 'deleteDirectoryTemplates', ids)
  if (result.success) revalidateTag('directory')
  return result
}
