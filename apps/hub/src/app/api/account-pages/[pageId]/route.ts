import { NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteAccountPages } from '@/lib/db/schema'
import { validateContentBlocks } from '@/lib/utils/content-block-validation'
import { serializeAccountPage } from '@/lib/utils/content-serializer'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'

const RESERVED_ACCOUNT_PAGE_SLUGS = ['api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']

const config = {
  entityName: 'Page',
  notFoundMessage: 'Account page not found',
  table: siteAccountPages,
  paramName: 'pageId',
  reservedSlugs: RESERVED_ACCOUNT_PAGE_SLUGS,
  requireSameOrigin: true,
  serializeResponse: serializeAccountPage,
  duplicateSlugError: (existing: { title: string | null }) =>
    `This slug is already used by another account page titled "${existing.title}". Please choose a different slug.`,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    content_blocks: 'contentBlocks',
    display_order: 'displayOrder',
    is_default: 'isDefault',
    is_published: 'isPublished',
  },
  transformUpdateValues: async (updates: Record<string, unknown>, page: typeof siteAccountPages.$inferSelect, updateValues: Record<string, unknown>) => {
    if (updates.content_blocks !== undefined) {
      const contentBlocksError = validateContentBlocks(updates.content_blocks)
      if (contentBlocksError) {
        return NextResponse.json(
          { data: null, error: contentBlocksError },
          { status: 400 }
        )
      }
    }

    if (updates.is_default === true) {
      await db.update(siteAccountPages)
        .set({ isDefault: false })
        .where(and(
          eq(siteAccountPages.siteId, page.siteId),
          eq(siteAccountPages.isDefault, true),
          ne(siteAccountPages.id, page.id)
        ))
    }

    return updateValues
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
