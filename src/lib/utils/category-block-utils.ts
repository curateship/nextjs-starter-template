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
 * Convert JSON content_blocks to CategoryBlock array format
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, categoryId: string): CategoryBlock[] {
  const blocks: CategoryBlock[] = []

  if (!categoryId || typeof categoryId !== 'string') {
    return blocks
  }

  if (contentBlocks && typeof contentBlocks === 'object') {
    const allowedBlockTypes = ['taxonomy-content']

    Object.entries(contentBlocks).forEach(([blockType, blockData]: [string, any]) => {
      if (blockType.startsWith('_')) {
        return
      }

      if (!allowedBlockTypes.includes(blockType)) {
        return
      }

      if (blockData && typeof blockData === 'object') {
        const { display_order, ...content } = blockData

        const sanitizedContent = sanitizeContent(content)

        blocks.push({
          id: `${blockType}-${categoryId}`,
          type: blockType,
          content: sanitizedContent,
          display_order: typeof display_order === 'number' ? display_order : 0
        })
      }
    })

    blocks.sort((a, b) => a.display_order - b.display_order)
  }

  return blocks
}
