import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { posts, postTemplates } from '@/lib/db/schema'
import { prunePostValueBlocksForTemplate } from '@/lib/actions/posts/post-template-inheritance'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializePost } from '@/lib/utils/content-serializer'
import { UUID_REGEX } from '@/lib/utils/validation'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

const config = {
  entityName: 'Post',
  table: posts,
  paramName: 'postId',
  serializeResponse: serializePost,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    meta_keywords: 'metaKeywords',
    featured_image: 'featuredImage',
    excerpt: 'excerpt',
    content: 'content',
    content_blocks: 'contentBlocks',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    template_id: 'templateId',
  },
  revalidateTags: ['posts', 'listing-views'],
  transformUpdateValues: async (updates: Record<string, unknown>, entity: any, updateValues: Record<string, unknown>) => {
    const templateId = typeof updateValues.templateId === 'string'
      ? updateValues.templateId
      : entity.templateId
    if (!UUID_REGEX.test(templateId)) {
      return NextResponse.json({ data: null, error: 'Invalid template ID' }, { status: 400 })
    }

    const [template] = await db
      .select({ contentBlocks: postTemplates.contentBlocks })
      .from(postTemplates)
      .where(and(eq(postTemplates.id, templateId), eq(postTemplates.siteId, entity.siteId)))
      .limit(1)

    if (!template) {
      return NextResponse.json({ data: null, error: 'Template not found' }, { status: 400 })
    }

    if (updates.content_blocks !== undefined || updates.template_id !== undefined) {
      updateValues.contentBlocks = prunePostValueBlocksForTemplate(
        (updates.content_blocks || entity.contentBlocks || {}) as Record<string, any>,
        (template.contentBlocks || {}) as Record<string, any>
      )
    }

    return updateValues
  },
  afterUpdate: (row: typeof posts.$inferSelect) => safeSyncSiteSearchDocument('post', row),
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
