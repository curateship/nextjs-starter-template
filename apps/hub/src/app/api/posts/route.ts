import { posts } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'

export const POST = createResourceHandler({
  entityName: 'Post',
  table: posts,
  defaultBlocksKey: 'posts',
  revalidateTags: ['listing-views'],
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    excerpt: data.excerpt || null,
    metaDescription: data.meta_description || null,
    contentBlocks,
  }),
})
