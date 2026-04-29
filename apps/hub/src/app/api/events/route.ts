import { events } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeEvent } from '@/lib/utils/content-serializer'

export const POST = createResourceHandler({
  entityName: 'Event',
  table: events,
  defaultBlocksKey: 'events',
  serializeResponse: serializeEvent,
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
})
