import { events } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'

const config = {
  entityName: 'Event',
  table: events,
  paramName: 'eventId',
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
    description: 'description',
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
