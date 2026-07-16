import { and, eq, ne } from 'drizzle-orm'
import { pages } from '@/lib/db/schema'
import { serializePage } from '@/lib/utils/content-serializer'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

const RESERVED_PAGE_SLUGS = ['account', 'api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global']

const config = {
  entityName: 'Page',
  table: pages,
  paramName: 'pageId',
  reservedSlugs: RESERVED_PAGE_SLUGS,
  serializeResponse: serializePage,
  duplicateSlugError: (existing: { title: string | null }) =>
    `This slug is already used by another page titled "${existing.title}". Please choose a different slug.`,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    meta_keywords: 'metaKeywords',
    template: 'template',
    is_homepage: 'isHomepage',
    is_published: 'isPublished',
    display_order: 'displayOrder',
  },
  transformUpdateValues: async (updates: Record<string, unknown>, page: typeof pages.$inferSelect, updateValues: Record<string, unknown>, executor: any) => {
    if (updates.is_homepage === true) {
      await executor.update(pages)
        .set({ isHomepage: false })
        .where(and(
          eq(pages.siteId, page.siteId),
          eq(pages.isHomepage, true),
          ne(pages.id, page.id)
        ))
    }

    return updateValues
  },
  afterUpdate: (row: typeof pages.$inferSelect) => safeSyncSiteSearchDocument('page', row),
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
