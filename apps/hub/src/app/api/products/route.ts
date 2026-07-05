import { products } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeProduct } from '@/lib/utils/content-serializer'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'

export const POST = createResourceHandler({
  entityName: 'Product',
  table: products,
  serializeResponse: serializeProduct,
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
  afterInsert: (row) => safeSyncSiteSearchDocument('product', row),
})
