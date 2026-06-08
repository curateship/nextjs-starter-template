import type { Event } from '@/lib/actions/events/event-actions'
import type { Product } from '@/lib/actions/products/product-actions'
import type { Category } from '@/lib/actions/categories/category-actions'
import type { Post } from '@/lib/actions/posts/post-actions'
import type { Page } from '@/lib/actions/pages/page-actions'
import type { AccountPage } from '@/lib/actions/account-pages/account-pages-actions'
import type { Directory } from '@/lib/actions/directories/directory-actions'
import { categories, directories, events, pages, posts, products, siteAccountPages } from '@/lib/db/schema'

type CategoryRow = typeof categories.$inferSelect
type DirectoryRow = typeof directories.$inferSelect
type EventRow = typeof events.$inferSelect
type PageRow = typeof pages.$inferSelect
type PostRow = typeof posts.$inferSelect
type ProductRow = typeof products.$inferSelect
type AccountPageRow = typeof siteAccountPages.$inferSelect

type ContentRow = {
  id: string
  siteId?: string
  site_id?: string
  parentId?: string | null
  parent_id?: string | null
  templateId?: string
  template_id?: string
  title: string
  slug: string
  isPublished?: boolean
  is_published?: boolean
  displayOrder?: number
  display_order?: number
  contentBlocks?: unknown
  content_blocks?: unknown
  excerpt?: string | null
  featuredImage?: string | null
  featured_image?: string | null
  sourceType?: string | null
  source_type?: string | null
  sourceId?: string | null
  source_id?: string | null
  isDefault?: boolean
  is_default?: boolean
  isHomepage?: boolean
  is_homepage?: boolean
  metaDescription?: string | null
  meta_description?: string | null
  status?: string
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

export function serializePost(row: PostRow | ContentRow): Post {
  const contentRow = row as ContentRow

  return {
    ...serializeContentRow(row),
    excerpt: contentRow.excerpt ?? null,
  } as Post
}

export function serializeProduct(row: ProductRow | ContentRow): Product {
  return serializeContentRow(row) as Product
}

export function serializePage(row: PageRow | ContentRow): Page {
  const contentRow = row as ContentRow

  return {
    ...serializeContentRow(row),
    is_homepage: requireValue(contentRow.isHomepage ?? contentRow.is_homepage, 'is_homepage'),
  } as Page
}

export function serializeAccountPage(row: AccountPageRow | ContentRow): AccountPage {
  const contentRow = row as ContentRow

  return {
    ...serializeContentRow(row),
    is_default: requireValue(contentRow.isDefault ?? contentRow.is_default, 'is_default'),
  } as AccountPage
}

export function serializeDirectory(row: DirectoryRow | ContentRow): Directory {
  const contentRow = row as ContentRow

  return {
    id: contentRow.id,
    site_id: requireValue(contentRow.siteId ?? contentRow.site_id, 'site_id'),
    template_id: requireValue(contentRow.templateId ?? contentRow.template_id, 'template_id'),
    title: contentRow.title,
    slug: contentRow.slug,
    status: requireValue(contentRow.status, 'status'),
    display_order: requireValue(contentRow.displayOrder ?? contentRow.display_order, 'display_order'),
    content_blocks: (contentRow.contentBlocks ?? contentRow.content_blocks ?? {}) as Record<string, any>,
    featured_image: contentRow.featuredImage ?? contentRow.featured_image ?? null,
    meta_description: contentRow.metaDescription ?? contentRow.meta_description ?? null,
    source_type: contentRow.sourceType ?? contentRow.source_type ?? null,
    source_id: contentRow.sourceId ?? contentRow.source_id ?? null,
    created_at: toIsoString(requireValue(contentRow.createdAt ?? contentRow.created_at, 'created_at')),
    updated_at: toIsoString(requireValue(contentRow.updatedAt ?? contentRow.updated_at, 'updated_at')),
  } as Directory
}
