import { directories } from '@/lib/db/schema'
import { createResourceHandler } from '@/lib/utils/api-resource-handler'
import { extractDirectoryIsPrivate } from '@/lib/actions/directories/directory-helpers'

export const POST = createResourceHandler({
  entityName: 'Directory',
  table: directories,
  defaultBlocksKey: 'directories',
  buildInsertValues: (data, siteId, slug, nextOrder, contentBlocks) => ({
    siteId,
    title: data.title.trim(),
    slug,
    isPublished: data.is_published !== false,
    displayOrder: nextOrder,
    featuredImage: data.featured_image || null,
    description: data.description || null,
    metaDescription: data.meta_description || null,
    isPrivate: extractDirectoryIsPrivate(contentBlocks),
    contentBlocks,
  }),
})
