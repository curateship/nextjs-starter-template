'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import { db } from '@/lib/db'
import { postTemplates, posts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { sanitizePostTemplateBlocks } from './post-template-inheritance'
import { ensurePostBlankTemplateForSite } from './post-template-ensure'
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

export type PostTemplate = TemplateRecord

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return Boolean(site)
}

async function ensureOwnedPostBlankTemplate(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return 'Invalid site ID'

  const user = await getAuthenticatedUser()
  if (!user) return 'Not authenticated'

  if (!await verifySiteOwnership(siteId, user.id)) {
    return 'Access denied'
  }

  await ensurePostBlankTemplateForSite(siteId)
  return null
}

export async function getPostTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: PostTemplate[] | null; total: number; error: string | null }> {
  const ensureError = await ensureOwnedPostBlankTemplate(siteId)
  if (ensureError) return { data: null, total: 0, error: ensureError }

  return getTemplatesBySite(postTemplates, 'getPostTemplatesBySite', siteId, options)
}

export async function getPostTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(postTemplates, 'getPostTemplateIdsAction', siteId)
}

export async function getPostTemplateById(
  templateId: string
): Promise<{ data: PostTemplate | null; error: string | null }> {
  return getTemplateById(postTemplates, 'getPostTemplateById', templateId)
}

export async function createPostTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: PostTemplate | null; error: string | null }> {
  const result = await createTemplate(postTemplates, 'createPostTemplate', {
    ...input,
    contentBlocks: sanitizePostTemplateBlocks(input.contentBlocks || {}),
  })
  if (result.data) {
    revalidateTag('posts')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function updatePostTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: PostTemplate | null; error: string | null }> {
  const sanitizedUpdates = updates.content_blocks === undefined
    ? updates
    : {
        ...updates,
        content_blocks: sanitizePostTemplateBlocks(updates.content_blocks),
      }

  const result = await updateTemplate(postTemplates, 'updatePostTemplate', templateId, sanitizedUpdates)
  if (result.data) {
    revalidateTag('posts')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function setDefaultPostTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  const result = await setDefaultTemplate(postTemplates, 'setDefaultPostTemplate', templateId)
  if (result.success) revalidateTag('posts')
  return result
}

export async function deletePostTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  if (!ids.length) return { success: false, error: 'No items selected' }
  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return { success: false, error: 'Invalid ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const templates = await db
    .select({
      id: postTemplates.id,
      siteId: postTemplates.siteId,
      isDefault: postTemplates.isDefault,
    })
    .from(postTemplates)
    .where(inArray(postTemplates.id, ids))

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
    .select({ id: posts.templateId })
    .from(posts)
    .where(inArray(posts.templateId, deletableTemplateIds))
    .limit(1)

  if (usedTemplate) {
    return { success: false, error: 'Template is used by one or more posts' }
  }

  const result = await deleteTemplates(postTemplates, 'deletePostTemplates', ids)
  if (result.success) revalidateTag('posts')
  return result
}
