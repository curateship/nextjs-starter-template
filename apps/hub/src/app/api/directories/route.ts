import { directories } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'

export const POST = createResourceHandler({
  entityName: 'Directory',
  table: directories,
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    status: data.status === 'published' || data.is_published === true ? 'published' : 'draft',
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
})
