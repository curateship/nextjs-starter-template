import { inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import { db } from '@/lib/db'
import { getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
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

/**
 * Categories, events, posts and directory listings each had their own copy of
 * these seven template actions. They were the same file with the entity name
 * swapped, so the whole set is built once here from a small config.
 *
 * Behaviour is unchanged, including every error string — the wording that
 * differed per entity ("used by one or more listings") comes in as config
 * rather than being standardised.
 */
export interface TemplateActionsConfig {
  /** The `*_templates` table these actions manage. */
  table: any
  /** The content table that points at a template, used for the in-use check. */
  contentTable: any
  /** That table's `template_id` column. */
  contentTemplateIdColumn: any
  /** Cache tag revalidated after a write — 'categories', 'events', … */
  cacheTag: string
  /** Capitalised entity word used to build the action labels: 'Category'. */
  entity: string
  /** Plural label for the templates action names: 'Categories' -> deleteCategoryTemplates. */
  sanitizeBlocks: (blocks: Record<string, any>) => Record<string, any>
  ensureBlankTemplateForSite: (siteId: string) => Promise<unknown>
  /** Exact wording when a template is still attached to content. */
  inUseError: string
  /** Extra flags for the shared update helper — posts deliberately passes none. */
  updateOptions?: { trimNameOnUpdate?: boolean; validateNameOnUpdate?: boolean }
}

export function createTemplateActions(config: TemplateActionsConfig) {
  const {
    table,
    contentTable,
    contentTemplateIdColumn,
    cacheTag,
    entity,
    sanitizeBlocks,
    ensureBlankTemplateForSite,
    inUseError,
    updateOptions,
  } = config

  // Auth-guarded wrapper so the blank-template ensure only runs for owned sites
  async function ensureOwnedBlankTemplate(siteId: string) {
    if (!UUID_REGEX.test(siteId)) return 'Invalid site ID'

    const user = await getAuthenticatedUser()
    if (!user) return 'Not authenticated'

    if (!await verifySiteOwnership(siteId, user.id)) {
      return 'Access denied'
    }

    await ensureBlankTemplateForSite(siteId)
    return null
  }

  async function getTemplatesBySiteImpl(
    siteId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<{ data: TemplateRecord[] | null; total: number; error: string | null }> {
    const ensureError = await ensureOwnedBlankTemplate(siteId)
    if (ensureError) return { data: null, total: 0, error: ensureError }

    return getTemplatesBySite(table, `get${entity}TemplatesBySite`, siteId, options)
  }

  async function getTemplateIdsActionImpl(siteId: string): Promise<{ ids: string[]; error: string | null }> {
    return getTemplateIds(table, `get${entity}TemplateIdsAction`, siteId)
  }

  async function getTemplateByIdImpl(
    templateId: string
  ): Promise<{ data: TemplateRecord | null; error: string | null }> {
    return getTemplateById(table, `get${entity}TemplateById`, templateId)
  }

  async function createTemplateImpl(input: {
    siteId: string
    name: string
    contentBlocks?: Record<string, any>
  }): Promise<{ data: TemplateRecord | null; error: string | null }> {
    const result = await createTemplate(table, `create${entity}Template`, {
      ...input,
      contentBlocks: sanitizeBlocks(input.contentBlocks || {}),
    })
    if (result.data) {
      revalidateTag(cacheTag)
      revalidateTag(`site-${result.data.site_id}`)
    }
    return result
  }

  async function updateTemplateImpl(
    templateId: string,
    updates: { name?: string; content_blocks?: Record<string, any> }
  ): Promise<{ data: TemplateRecord | null; error: string | null }> {
    const sanitizedUpdates = updates.content_blocks === undefined
      ? updates
      : {
          ...updates,
          content_blocks: sanitizeBlocks(updates.content_blocks),
        }

    const result = await updateTemplate(
      table,
      `update${entity}Template`,
      templateId,
      sanitizedUpdates,
      updateOptions
    )
    if (result.data) {
      revalidateTag(cacheTag)
      revalidateTag(`site-${result.data.site_id}`)
    }
    return result
  }

  async function setDefaultTemplateImpl(templateId: string): Promise<{ success: boolean; error: string | null }> {
    const result = await setDefaultTemplate(table, `setDefault${entity}Template`, templateId)
    if (result.success) revalidateTag(cacheTag)
    return result
  }

  async function deleteTemplatesImpl(ids: string[]): Promise<{ success: boolean; error: string | null }> {
    if (!ids.length) return { success: false, error: 'No items selected' }
    if (ids.some((id) => !UUID_REGEX.test(id))) {
      return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const templates = await db
      .select({
        id: table.id,
        siteId: table.siteId,
        isDefault: table.isDefault,
      })
      .from(table)
      .where(inArray(table.id, ids))

    if (!templates.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(templates.map((template: any) => template.siteId as string))]
    const ownsAllSites = await Promise.all(
      siteIds.map((siteId) => verifySiteOwnership(siteId as string, user.id))
    )
    if (!ownsAllSites.every(Boolean)) {
      return { success: false, error: 'Access denied' }
    }

    const deletableTemplateIds = templates
      .filter((template: any) => !template.isDefault)
      .map((template: any) => template.id as string)

    if (!deletableTemplateIds.length) {
      return { success: false, error: 'Default templates cannot be deleted' }
    }

    // template_id is NOT NULL with ON DELETE RESTRICT — block deletes for in-use templates
    const [usedTemplate] = await db
      .select({ id: contentTemplateIdColumn })
      .from(contentTable)
      .where(inArray(contentTemplateIdColumn, deletableTemplateIds))
      .limit(1)

    if (usedTemplate) {
      return { success: false, error: inUseError }
    }

    const result = await deleteTemplates(table, `delete${entity}Templates`, ids)
    if (result.success) revalidateTag(cacheTag)
    return result
  }

  return {
    getTemplatesBySiteImpl,
    getTemplateIdsActionImpl,
    getTemplateByIdImpl,
    createTemplateImpl,
    updateTemplateImpl,
    setDefaultTemplateImpl,
    deleteTemplatesImpl,
  }
}
