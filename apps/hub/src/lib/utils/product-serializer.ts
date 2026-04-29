import type { Product } from '@/lib/actions/products/product-actions'
import { products } from '@/lib/db/schema'

type ProductRow = typeof products.$inferSelect

function toIsoString(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString()
}

export function serializeProduct(row: ProductRow): Product {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    slug: row.slug,
    is_published: row.isPublished,
    display_order: row.displayOrder,
    content_blocks: (row.contentBlocks || {}) as Record<string, any>,
    featured_image: row.featuredImage,
    meta_description: row.metaDescription,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  }
}
