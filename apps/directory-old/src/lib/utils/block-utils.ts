/**
 * Shared block conversion utilities.
 * Generic version that replaces product-block-utils, event-block-utils,
 * directory-block-utils, category-block-utils, and page-block-utils.
 */

import { sanitizeContent } from './sanitize'

/** Generic content block interface used across all builders */
export interface ContentBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
  /** Optional title field (used by page builder) */
  title?: string
}

/**
 * Convert JSON content_blocks object to a sorted array of ContentBlock.
 * Sanitizes content and optionally filters to allowed block types.
 *
 * @param contentBlocks - Raw JSON object from database (key=blockId, value has type/content/display_order)
 * @param entityId - The entity ID for validation (pass empty string to skip validation)
 * @param allowedBlockTypes - Optional whitelist of block type strings. If omitted, all blocks pass.
 */
export function convertContentBlocksToArray(
  contentBlocks: Record<string, any>,
  entityId: string,
  allowedBlockTypes?: string[]
): ContentBlock[] {
  if (!contentBlocks || typeof contentBlocks !== 'object') return []
  if (entityId !== '' && (!entityId || typeof entityId !== 'string')) return []

  return Object.entries(contentBlocks)
    .filter(([key, value]) => value && typeof value === 'object' && 'type' in value && !key.startsWith('_'))
    .filter(([, value]) => !allowedBlockTypes || allowedBlockTypes.includes(value.type))
    .map(([id, block]) => ({
      id: block.id || id,
      type: block.type,
      content: sanitizeContent(block.content),
      display_order: typeof block.display_order === 'number' ? block.display_order : 0,
      ...(block.title ? { title: block.title } : {}),
    }))
    .sort((a, b) => a.display_order - b.display_order)
}

/**
 * Convert JSON blocks object to array without sanitization.
 * Used by page/user-page builders where content is being edited (not rendered).
 * Preserves all block fields including title.
 */
export function convertJsonToBlocks(jsonBlocks: Record<string, any>): ContentBlock[] {
  if (!jsonBlocks || typeof jsonBlocks !== 'object') return []

  return Object.entries(jsonBlocks)
    .filter(([key, value]) => value && typeof value === 'object' && 'type' in value && !key.startsWith('_'))
    .map(([id, block]) => ({
      id: block.id || id,
      ...block
    }))
    .sort((a, b) => {
      const orderA = a.display_order ?? 999
      const orderB = b.display_order ?? 999
      return orderA - orderB
    })
}

/**
 * Convert UI blocks array back to JSON object format for storage.
 * Inverse of convertContentBlocksToArray.
 */
export function convertBlocksToJson(blocks: ContentBlock[]): Record<string, any> {
  if (!Array.isArray(blocks)) return {}

  const jsonBlocks: Record<string, any> = {}
  blocks.forEach(block => {
    const { id, ...blockData } = block
    if (id) {
      jsonBlocks[id] = blockData
    }
  })
  return jsonBlocks
}

/** Generate a unique block ID */
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
