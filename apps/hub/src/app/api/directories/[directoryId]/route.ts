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
    status: 'status',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
  },
  revalidateTags: ['directory', 'listing-views'],
  transformUpdateValues: (updates: Record<string, unknown>, _entity: any, updateValues: Record<string, unknown>) => {
    if (updates.is_published === true) {
      updateValues.status = 'published'
    }

    if (updates.is_published === false) {
      updateValues.status = 'draft'
    }

    return updateValues
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
