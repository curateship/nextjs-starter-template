import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { directories, directoryTemplates } from '@/lib/db/schema'
import { pruneDirectoryValueBlocksForTemplate } from '@/lib/actions/directories/directory-template-inheritance'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeDirectory } from '@/lib/utils/content-serializer'
import { UUID_REGEX } from '@/lib/utils/validation'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

const config = {
  entityName: 'Directory',
  table: directories,
  paramName: 'directoryId',
  serializeResponse: serializeDirectory,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    status: 'status',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
    template_id: 'templateId',
  },
  revalidateTags: ['directory', 'listing-views'],
  afterUpdate: (row: typeof directories.$inferSelect) => safeSyncSiteSearchDocument('directory', row),
  transformUpdateValues: async (updates: Record<string, unknown>, entity: any, updateValues: Record<string, unknown>, executor: any) => {
    if (updates.is_published === true) {
      updateValues.status = 'published'
    }

    if (updates.is_published === false) {
      updateValues.status = 'draft'
    }

    const templateId = typeof updateValues.templateId === 'string'
      ? updateValues.templateId
      : entity.templateId
    if (!UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Invalid template ID' }, { status: 400 })
    }

    const [template] = await executor
      .select({ contentBlocks: directoryTemplates.contentBlocks })
      .from(directoryTemplates)
      .where(and(eq(directoryTemplates.id, templateId), eq(directoryTemplates.siteId, entity.siteId)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    if (updates.content_blocks !== undefined || updates.template_id !== undefined) {
      updateValues.contentBlocks = pruneDirectoryValueBlocksForTemplate(
        (updates.content_blocks || entity.contentBlocks || {}) as Record<string, any>,
        (template.contentBlocks || {}) as Record<string, any>
      )
    }

    return updateValues
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
