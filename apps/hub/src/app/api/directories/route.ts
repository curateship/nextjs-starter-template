import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories, directoryTemplates } from '@/lib/db/schema'
import { pruneDirectoryValueBlocksForTemplate } from '@/lib/actions/directories/directory-template-inheritance'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeDirectory } from '@/lib/utils/content-serializer'
import { UUID_REGEX } from '@/lib/utils/validation'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

export const POST = createResourceHandler({
  entityName: 'Directory',
  table: directories,
  serializeResponse: serializeDirectory,
  revalidateTags: ['directory', 'listing-views'],
  prepareCreateData: async (data) => {
    const templateId = typeof data.template_id === 'string' ? data.template_id : ''
    if (!UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Template is required' }, { status: 400 })
    }

    const [template] = await db
      .select({ id: directoryTemplates.id, contentBlocks: directoryTemplates.contentBlocks })
      .from(directoryTemplates)
      .where(and(eq(directoryTemplates.id, templateId), eq(directoryTemplates.siteId, data.site_id)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    return {
      ...data,
      content_blocks: pruneDirectoryValueBlocksForTemplate(
        data.content_blocks || {},
        (template.contentBlocks || {}) as Record<string, any>
      ),
    }
  },
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    templateId: data.template_id,
    title: data.title.trim(),
    slug,
    status: data.status === 'published' || data.is_published === true ? 'published' : 'draft',
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
  afterInsert: (row) => safeSyncSiteSearchDocument('directory', row),
})
