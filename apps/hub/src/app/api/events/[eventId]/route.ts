import { events } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeEvent } from '@/lib/utils/content-serializer'

const config = {
  entityName: 'Event',
  table: events,
  paramName: 'eventId',
  serializeResponse: serializeEvent,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
