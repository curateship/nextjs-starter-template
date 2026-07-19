import { and, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import { db } from '@/lib/db'
import { events, eventTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { sanitizeEventTemplateBlocks } from './event-template-inheritance'
import { ensureEventBlankTemplateForSite } from './event-template-ensure'
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

export type EventTemplate = TemplateRecord

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return Boolean(site)
}

// Auth-guarded wrapper so the blank-template ensure only runs for owned sites
async function ensureOwnedEventBlankTemplate(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return 'Invalid site ID'

  const user = await getAuthenticatedUser()
  if (!user) return 'Not authenticated'

  if (!await verifySiteOwnership(siteId, user.id)) {
    return 'Access denied'
  }

  await ensureEventBlankTemplateForSite(siteId)
  return null
}

export async function getEventTemplatesBySiteImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: EventTemplate[] | null; total: number; error: string | null }> {
  const ensureError = await ensureOwnedEventBlankTemplate(siteId)
  if (ensureError) return { data: null, total: 0, error: ensureError }

  return getTemplatesBySite(eventTemplates, 'getEventTemplatesBySite', siteId, options)
}

export async function getEventTemplateIdsActionImpl(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(eventTemplates, 'getEventTemplateIdsAction', siteId)
}

export async function getEventTemplateByIdImpl(
  templateId: string
): Promise<{ data: EventTemplate | null; error: string | null }> {
  return getTemplateById(eventTemplates, 'getEventTemplateById', templateId)
}

export async function createEventTemplateImpl(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: EventTemplate | null; error: string | null }> {
  const result = await createTemplate(eventTemplates, 'createEventTemplate', {
    ...input,
    contentBlocks: sanitizeEventTemplateBlocks(input.contentBlocks || {}),
  })
  if (result.data) {
    revalidateTag('events')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function updateEventTemplateImpl(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: EventTemplate | null; error: string | null }> {
  const sanitizedUpdates = updates.content_blocks === undefined
    ? updates
    : {
        ...updates,
        content_blocks: sanitizeEventTemplateBlocks(updates.content_blocks),
      }

  const result = await updateTemplate(eventTemplates, 'updateEventTemplate', templateId, sanitizedUpdates, {
    trimNameOnUpdate: false,
    validateNameOnUpdate: false,
  })
  if (result.data) {
    revalidateTag('events')
    revalidateTag(`site-${result.data.site_id}`)
  }
  return result
}

export async function setDefaultEventTemplateImpl(templateId: string): Promise<{ success: boolean; error: string | null }> {
  const result = await setDefaultTemplate(eventTemplates, 'setDefaultEventTemplate', templateId)
  if (result.success) revalidateTag('events')
  return result
}

export async function deleteEventTemplatesImpl(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  if (!ids.length) return { success: false, error: 'No items selected' }
  if (ids.some((id) => !UUID_REGEX.test(id))) {
    return { success: false, error: 'Invalid ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const templates = await db
    .select({
      id: eventTemplates.id,
      siteId: eventTemplates.siteId,
      isDefault: eventTemplates.isDefault,
    })
    .from(eventTemplates)
    .where(inArray(eventTemplates.id, ids))

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
    .select({ id: events.templateId })
    .from(events)
    .where(inArray(events.templateId, deletableTemplateIds))
    .limit(1)

  if (usedTemplate) {
    return { success: false, error: 'Template is used by one or more events' }
  }

  const result = await deleteTemplates(eventTemplates, 'deleteEventTemplates', ids)
  if (result.success) revalidateTag('events')
  return result
}
