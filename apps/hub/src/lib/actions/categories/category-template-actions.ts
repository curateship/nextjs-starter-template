'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { categories, categoryTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { sanitizeCategoryTemplateBlocks } from './category-template-inheritance'
import { ensureCategoryBlankTemplateForSite } from './category-template-ensure'
import { UUID_REGEX } from '@/lib/utils/validation'
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

export type CategoryTemplate = TemplateRecord

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return Boolean(site)
}

// Auth-guarded wrapper so the blank-template ensure only runs for owned sites
async function ensureOwnedCategoryBlankTemplate(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return 'Invalid site ID'

  const user = await getAuthenticatedUser()
  if (!user) return 'Not authenticated'

  if (!await verifySiteOwnership(siteId, user.id)) {
    return 'Access denied'
  }

  await ensureCategoryBlankTemplateForSite(siteId)
  return null
}

export async function getCategoryTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: CategoryTemplate[] | null; total: number; error: string | null }> {
  const ensureError = await ensureOwnedCategoryBlankTemplate(siteId)
  if (ensureError) return { data: null, total: 0, error: ensureError }

  return getTemplatesBySite(categoryTemplates, 'getCategoryTemplatesBySite', siteId, options)
}

export async function getCategoryTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(categoryTemplates, 'getCategoryTemplateIdsAction', siteId)
}

export async function getCategoryTemplateById(
  templateId: string
): Promise<{ data: CategoryTemplate | null; error: string | null }> {
  return getTemplateById(categoryTemplates, 'getCategoryTemplateById', templateId)
}

export async function createCategoryTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: CategoryTemplate | null; error: string | null }> {
  const result = await createTemplate(categoryTemplates, 'createCategoryTemplate', {
    ...input,
    contentBlocks: sanitizeCategoryTemplateBlocks(input.contentBlocks || {}),
  })
  if (result.data) {
    revalidateTag('categories')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function updateCategoryTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: CategoryTemplate | null; error: string | null }> {
  const sanitizedUpdates = updates.content_blocks === undefined
    ? updates
    : {
        ...updates,
        content_blocks: sanitizeCategoryTemplateBlocks(updates.content_blocks),
      }

  const result = await updateTemplate(categoryTemplates, 'updateCategoryTemplate', templateId, sanitizedUpdates, {
    trimNameOnUpdate: false,
    validateNameOnUpdate: false,
  })
  if (result.data) {
    revalidateTag('categories')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function setDefaultCategoryTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  const result = await setDefaultTemplate(categoryTemplates, 'setDefaultCategoryTemplate', templateId)
  if (result.success) revalidateTag('categories')
  return result
}

export async function deleteCategoryTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  if (!ids.length) return { success: false, error: 'No items selected' }
  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return { success: false, error: 'Invalid ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const templates = await db
    .select({
      id: categoryTemplates.id,
      siteId: categoryTemplates.siteId,
      isDefault: categoryTemplates.isDefault,
    })
    .from(categoryTemplates)
    .where(inArray(categoryTemplates.id, ids))

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

  // template_id is NOT NULL with ON DELETE RESTRICT — block deletes for in-use templates
  const [usedTemplate] = await db
    .select({ id: categories.templateId })
    .from(categories)
    .where(inArray(categories.templateId, deletableTemplateIds))
    .limit(1)

  if (usedTemplate) {
    return { success: false, error: 'Template is used by one or more categories' }
  }

  const result = await deleteTemplates(categoryTemplates, 'deleteCategoryTemplates', ids)
  if (result.success) revalidateTag('categories')
  return result
}
