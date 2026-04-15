import { PAGE_BLOCK_TYPES } from '@/components/admin/page-builder/config/page-block-types'
import { PRODUCT_BLOCK_TYPES } from '@/components/admin/product-builder/config/product-block-types'
import { POST_BLOCK_TYPES } from '@/components/admin/post-builder/config/post-block-types'
import { EVENT_BLOCK_TYPES } from '@/components/admin/event-builder/config/event-block-types'
import { DIRECTORY_BLOCK_TYPES } from '@/components/admin/directory-builder/config/directory-block-types'
import { CATEGORY_BLOCK_TYPES } from '@/components/admin/category-builder/config/category-block-types'
import { ACCOUNT_PAGE_BLOCK_TYPES } from '@/components/admin/account-page-builder/config/account-page-block-types'
import { NEWSLETTER_BLOCK_TYPES } from '@/components/admin/newsletter-builder/config/newsletter-block-types'

const BLOCK_TYPE_MAPS: Record<string, { type: string; defaultContent: Record<string, any> }[]> = {
  pages: PAGE_BLOCK_TYPES,
  products: PRODUCT_BLOCK_TYPES,
  posts: POST_BLOCK_TYPES,
  events: EVENT_BLOCK_TYPES,
  directories: DIRECTORY_BLOCK_TYPES,
  newsletters: NEWSLETTER_BLOCK_TYPES,
  categories: CATEGORY_BLOCK_TYPES,
  account_pages: ACCOUNT_PAGE_BLOCK_TYPES,
}

/** Check if content_blocks has any actual block entries (not just metadata like _settings, show_featured_image) */
export function hasActualBlocks(contentBlocks: Record<string, any> | null | undefined): boolean {
  if (!contentBlocks) return false
  return Object.values(contentBlocks).some(
    v => typeof v === 'object' && v !== null && 'type' in v
  )
}

/** Apply site default blocks to content_blocks, preserving any existing metadata */
export function applyDefaultBlocks(
  contentBlocks: Record<string, any> | null | undefined,
  contentType: string,
  defaultBlockTypes: string[] | undefined
): Record<string, any> {
  const existing = contentBlocks || {}
  if (hasActualBlocks(existing)) return existing
  if (!defaultBlockTypes?.length) return existing
  return { ...existing, ...buildDefaultContentBlocks(contentType, defaultBlockTypes) }
}

export function buildDefaultContentBlocks(
  contentType: string,
  blockTypeStrings: string[]
): Record<string, any> {
  const definitions = BLOCK_TYPE_MAPS[contentType] || []
  const blocks: Record<string, any> = {}

  blockTypeStrings.forEach((type, index) => {
    const def = definitions.find(d => d.type === type)
    const id = `${type}-${Date.now()}-${index}`
    blocks[id] = {
      id,
      type,
      content: def?.defaultContent || {},
      display_order: index + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  })
  return blocks
}
