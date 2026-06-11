import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pages } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializePage } from '@/lib/utils/content-serializer'

export const POST = createResourceHandler({
  entityName: 'Page',
  table: pages,
  requireSameOrigin: true,
  // Pages additionally reserve 'account' and 'maintenance' (site-level routes)
  reservedSlugs: ['account', 'api', 'admin', 'maintenance', 'www', 'mail', 'ftp', 'global'],
  serializeResponse: serializePage,
  // When creating a new homepage, unset the existing one first
  beforeInsert: async (data, siteId) => {
    if (data.is_homepage === true) {
      await db.update(pages)
        .set({ isHomepage: false })
        .where(and(eq(pages.siteId, siteId), eq(pages.isHomepage, true)))
    }
  },
  buildInsertValues: (data, siteId, slug, nextOrder) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isHomepage: data.is_homepage || false,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    metaDescription: data.meta_description || null,
  }),
})
