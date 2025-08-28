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
    case 'product-default':
      return 'Product Information'
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
    case 'product-pricing':
      return 'Product Pricing'
    case 'faq':
      return 'FAQ'
    case 'listing-views':
      return 'Product Listings'
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
 * Convert JSON content_blocks to ProductBlock array format
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, productId: string): ProductBlock[] {
  const blocks: ProductBlock[] = []
  
  // SECURITY: Validate productId to prevent injection
  if (!productId || typeof productId !== 'string') {
    return blocks
  }
  
  if (contentBlocks && typeof contentBlocks === 'object') {
    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['product-default', 'product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot', 'product-pricing', 'faq', 'listing-views']
    
    Object.entries(contentBlocks).forEach(([blockType, blockData]: [string, any]) => {
      // SECURITY: Validate block type
      if (!allowedBlockTypes.includes(blockType)) {
        return // Skip invalid block types
      }
      
      if (blockData && typeof blockData === 'object') {
        const { display_order, ...content } = blockData
        
        // SECURITY: Sanitize all content to prevent XSS
        const sanitizedContent = sanitizeContent(content)
        
        blocks.push({
          id: `${blockType}-${productId}`,
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