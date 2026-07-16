import { eq, and } from 'drizzle-orm'
import { NextResponse } from '@/lib/web-response'
import { siteAccountPages } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { validateContentBlocks } from '@/lib/utils/content-block-validation'
import { serializeAccountPage } from '@/lib/utils/content-serializer'

export const POST = createResourceHandler({
  entityName: 'Account page',
  table: siteAccountPages,
  reservedSlugs: ['api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global'],
  revalidateTags: ['public-profile'],
  serializeResponse: serializeAccountPage,
  // Validate content blocks and unset the existing default page before insert
  beforeInsert: async (data, siteId, executor) => {
    const contentBlocksError = validateContentBlocks(data.content_blocks ?? {})
    if (contentBlocksError) {
      return NextResponse.json({ data: null, error: contentBlocksError }, { status: 400 })
    }

    if (data.is_default === true) {
      await executor.update(siteAccountPages)
        .set({ isDefault: false })
        .where(and(eq(siteAccountPages.siteId, siteId), eq(siteAccountPages.isDefault, true)))
    }
  },
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isDefault: data.is_default || false,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
})
