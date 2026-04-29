import type { Event } from '@/lib/actions/events/event-actions'
import type { Product } from '@/lib/actions/products/product-actions'
import type { Category } from '@/lib/actions/categories/category-actions'
import { categories, events, products } from '@/lib/db/schema'

type CategoryRow = typeof categories.$inferSelect
type EventRow = typeof events.$inferSelect
type ProductRow = typeof products.$inferSelect

type ContentRow = {
  id: string
  siteId?: string
  site_id?: string
  parentId?: string | null
  parent_id?: string | null
  title: string
  slug: string
  isPublished?: boolean
  is_published?: boolean
  displayOrder?: number
  display_order?: number
  contentBlocks?: unknown
  content_blocks?: unknown
  featuredImage?: string | null
  featured_image?: string | null
  metaDescription?: string | null
  meta_description?: string | null
  createdAt?: Date | string
  created_at?: Date | string
  updatedAt?: Date | string
  updated_at?: Date | string
}

type SerializedContent = {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

function requireValue<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${field} while serializing content row`)
  }

  return value
}

function toIsoString(value: Date | string): string {
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString()
}

export function serializeContentRow(row: ContentRow): SerializedContent {
  return {
    id: row.id,
    site_id: requireValue(row.siteId ?? row.site_id, 'site_id'),
    title: row.title,
    slug: row.slug,
    is_published: requireValue(row.isPublished ?? row.is_published, 'is_published'),
    display_order: requireValue(row.displayOrder ?? row.display_order, 'display_order'),
    content_blocks: (row.contentBlocks ?? row.content_blocks ?? {}) as Record<string, any>,
    featured_image: row.featuredImage ?? row.featured_image ?? null,
    meta_description: row.metaDescription ?? row.meta_description ?? null,
    created_at: toIsoString(requireValue(row.createdAt ?? row.created_at, 'created_at')),
    updated_at: toIsoString(requireValue(row.updatedAt ?? row.updated_at, 'updated_at')),
  }
}

export function serializeCategory(row: CategoryRow | ContentRow): Category {
  const contentRow = row as ContentRow

  return {
    ...serializeContentRow(row),
    parent_id: contentRow.parentId ?? contentRow.parent_id ?? null,
  } as Category
}

export function serializeEvent(row: EventRow | ContentRow): Event {
  return serializeContentRow(row) as Event
}

export function serializeProduct(row: ProductRow | ContentRow): Product {
  return serializeContentRow(row) as Product
}
