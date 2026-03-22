import { products } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'

const config = {
  entityName: 'Product',
  table: products,
  paramName: 'productId',
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    meta_keywords: 'metaKeywords',
    is_homepage: 'isHomepage',
    is_published: 'isPublished',
    display_order: 'displayOrder',
    content_blocks: 'contentBlocks',
  },
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
