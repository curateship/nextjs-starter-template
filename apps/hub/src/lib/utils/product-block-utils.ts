/**
 * Utility functions for product block conversion
 */

export interface ProductBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

/**
 * Helper function to get block title for product blocks
 */
export function getProductBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'product-content':
      return 'Product Content'
    case 'product-default':
      return 'Product Content'
    case 'product-hero':
      return 'Product Hero'
    case 'product-details':
      return 'Product Details'
    case 'product-gallery':
      return 'Product Gallery'
    case 'product-features':
      return 'Product Features'
    case 'product-hotspot':
      return 'Product Hotspot'
    case 'product-checkout':
      return 'Product Checkout'
    case 'product-lead-magnet':
      return 'Lead Magnet'
    case 'product-faq':
      return 'FAQ'
    case 'listing-views':
      return 'Product Listings'
    case 'product-rich-text':
      return 'Rich Text'
    case 'product-video':
      return 'Product Video'
    default:
      return 'Product Block'
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
 * Convert JSON content_blocks to ProductBlock array format.
 * Matches pages gold standard: key=blockId, value has { type, content, display_order }
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, productId: string): ProductBlock[] {
  if (!contentBlocks || typeof contentBlocks !== 'object') return []
  if (!productId || typeof productId !== 'string') return []

  const allowedBlockTypes = ['product-content', 'product-default', 'product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot', 'product-checkout', 'product-lead-magnet', 'product-faq', 'listing-views', 'product-rich-text', 'product-video']

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