import { products } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializeProduct } from '@/lib/utils/content-serializer'

const config = {
  entityName: 'Product',
  table: products,
  paramName: 'productId',
  serializeResponse: serializeProduct,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    meta_keywords: 'metaKeywords',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    created_at: 'createdAt',
    content_blocks: 'contentBlocks',
    featured_image: 'featuredImage',
  },
  revalidateTags: ['listing-views'],
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
