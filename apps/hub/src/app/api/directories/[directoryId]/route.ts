import { directories } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { extractDirectoryIsPrivate } from '@/lib/actions/directories/directory-helpers'

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
  transformUpdateValues: (updates: Record<string, unknown>, _entity: any, updateValues: Record<string, unknown>) => {
    if (updates.content_blocks && typeof updates.content_blocks === 'object') {
      updateValues.isPrivate = extractDirectoryIsPrivate(updates.content_blocks as Record<string, any>)
    }

    return updateValues
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
