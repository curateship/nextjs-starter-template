/**
 * Utility functions for taxonomy content blocks
 */

export interface TaxonomyBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

/**
 * Helper function to get block title for taxonomy blocks
 */
export function getTaxonomyBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'taxonomy-content':
      return 'Content'
    default:
      return 'Taxonomy Block'
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
 * Convert JSON content_blocks to TaxonomyBlock array format
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, taxonomyId: string): TaxonomyBlock[] {
  const blocks: TaxonomyBlock[] = []

  // SECURITY: Validate taxonomyId to prevent injection
  if (!taxonomyId || typeof taxonomyId !== 'string') {
    return blocks
  }

  if (contentBlocks && typeof contentBlocks === 'object') {
    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['taxonomy-content']

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
          id: `${blockType}-${taxonomyId}`,
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

