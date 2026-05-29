import { posts } from '@/lib/db/schema'
import { getResourceHandler, updateResourceHandler } from '@/lib/utils/api-resource-handler'
import { serializePost } from '@/lib/utils/content-serializer'

const config = {
  entityName: 'Post',
  table: posts,
  paramName: 'postId',
  serializeResponse: serializePost,
  updateFieldMap: {
    title: 'title',
    slug: 'slug',
    meta_description: 'metaDescription',
    meta_keywords: 'metaKeywords',
    featured_image: 'featuredImage',
    excerpt: 'excerpt',
    content: 'content',
    content_blocks: 'contentBlocks',
    is_published: 'isPublished',
    display_order: 'displayOrder',
  },
  revalidateTags: ['listing-views'],
}

export const GET = getResourceHandler(config)
export const PUT = updateResourceHandler(config)
