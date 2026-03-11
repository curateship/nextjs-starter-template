/**
 * Utility functions for category content blocks
 */

export interface CategoryBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

/**
 * Helper function to get block title for category blocks
 */
export function getCategoryBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'taxonomy-content':
      return 'Content'
    default:
      return 'Category Block'
  }
}

/**
 * Sanitize string content to prevent XSS
 */
function sanitizeString(value: any): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:text\/html/gi, '')
}

/**
 * Recursively sanitize content object
 */
function sanitizeContent(content: any): any {
  if (typeof content === 'string') {
    return sanitizeString(content)
  }
  if (Array.isArray(content)) {
    return content.map(sanitizeContent)
  }
  if (content && typeof content === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(content)) {
      sanitized[key] = sanitizeContent(value)
    }
    return sanitized
  }
  return content
}

/**
 * Convert JSON content_blocks to CategoryBlock array format.
 * Matches pages gold standard: key=blockId, value has { type, content, display_order }
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, categoryId: string): CategoryBlock[] {
  if (!contentBlocks || typeof contentBlocks !== 'object') return []
  if (!categoryId || typeof categoryId !== 'string') return []

  const allowedBlockTypes = ['taxonomy-content']

  return Object.entries(contentBlocks)
    .filter(([key, value]) => value && typeof value === 'object' && 'type' in value && !key.startsWith('_'))
    .filter(([, value]) => allowedBlockTypes.includes(value.type))
    .map(([id, block]) => ({
      id: block.id || id,
      type: block.type,
      content: sanitizeContent(block.content),
      display_order: typeof block.display_order === 'number' ? block.display_order : 0
    }))
    .sort((a, b) => a.display_order - b.display_order)
}
