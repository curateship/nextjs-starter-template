import { directories } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'

const config = {
  entityName: 'Directory',
  table: directories,
  paramName: 'directoryId',
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
