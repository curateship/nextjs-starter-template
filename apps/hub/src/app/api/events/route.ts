import { events } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'

export const POST = createResourceHandler({
  entityName: 'Event',
  table: events,
  defaultBlocksKey: 'events',
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    description: data.description || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
})
