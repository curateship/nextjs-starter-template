import { products } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'

export const POST = createResourceHandler({
  entityName: 'Product',
  table: products,
  defaultBlocksKey: 'products',
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isHomepage: false,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    contentBlocks,
  }),
})
