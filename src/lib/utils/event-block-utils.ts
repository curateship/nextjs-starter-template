/**
 * Utility functions for event block conversion
 */

export interface EventBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

/**
 * Helper function to get block title for event blocks
 */
export function getEventBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'event-content':
      return 'Content'
    default:
      return 'Event Block'
  }
}

/**
 * Sanitize string content to prevent XSS
 */
function sanitizeString(value: any): string {
  if (typeof value !== 'string') return ''
  // Remove script tags, javascript:, and event handlers
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
 * Convert JSON content_blocks to EventBlock array format
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, eventId: string): EventBlock[] {
  const blocks: EventBlock[] = []

  // SECURITY: Validate eventId to prevent injection
  if (!eventId || typeof eventId !== 'string') {
    return blocks
  }

  if (contentBlocks && typeof contentBlocks === 'object') {
    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['event-content']

    Object.entries(contentBlocks).forEach(([blockType, blockData]: [string, any]) => {
      // Skip _settings and other metadata fields
      if (blockType.startsWith('_')) {
        return
      }

      // SECURITY: Validate block type
      if (!allowedBlockTypes.includes(blockType)) {
        return // Skip invalid block types
      }

      if (blockData && typeof blockData === 'object') {
        const { display_order, ...content } = blockData

        // SECURITY: Sanitize all content to prevent XSS
        const sanitizedContent = sanitizeContent(content)

        blocks.push({
          id: `${blockType}-${eventId}`,
          type: blockType,
          content: sanitizedContent,
          display_order: typeof display_order === 'number' ? display_order : 0
        })
      }
    })

    // Sort blocks by display_order
    blocks.sort((a, b) => a.display_order - b.display_order)
  }

  return blocks
}
