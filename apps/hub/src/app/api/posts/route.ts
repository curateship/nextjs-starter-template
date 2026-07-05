import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { posts, postTemplates } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializePost } from '@/lib/utils/content-serializer'
import { prunePostValueBlocksForTemplate } from '@/lib/actions/posts/post-template-inheritance'
import { UUID_REGEX } from '@/lib/utils/validation'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

export const POST = createResourceHandler({
  entityName: 'Post',
  table: posts,
  serializeResponse: serializePost,
  revalidateTags: ['posts', 'listing-views'],
  prepareCreateData: async (data) => {
    const templateId = typeof data.template_id === 'string' ? data.template_id : ''
    if (!UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Template is required' }, { status: 400 })
    }

    const [template] = await db
      .select({ id: postTemplates.id, contentBlocks: postTemplates.contentBlocks })
      .from(postTemplates)
      .where(and(eq(postTemplates.id, templateId), eq(postTemplates.siteId, data.site_id)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    return {
      ...data,
      template_id: template.id,
      content_blocks: prunePostValueBlocksForTemplate(
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
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    excerpt: data.excerpt || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
  afterInsert: (row) => safeSyncSiteSearchDocument('post', row),
})
