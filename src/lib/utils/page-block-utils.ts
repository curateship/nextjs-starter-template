/**
 * Utility functions for converting between page JSON blocks and UI array format
 */

/**
 * Convert JSON blocks object to array format for UI
 */
export function convertPageJsonToBlocks(jsonBlocks: Record<string, any>): any[] {
  if (!jsonBlocks || typeof jsonBlocks !== 'object') {
    return []
  }

  // Convert object entries to array and sort by display_order
  return Object.entries(jsonBlocks)
    .map(([id, block]) => ({
      id,
      ...block
    }))
    .sort((a, b) => {
      const orderA = a.display_order ?? 999
      const orderB = b.display_order ?? 999
      return orderA - orderB
    })
}

/**
 * Convert UI blocks array to JSON object format for storage
 */
export function convertPageBlocksToJson(blocks: any[]): Record<string, any> {
  if (!Array.isArray(blocks)) {
    return {}
  }

  const jsonBlocks: Record<string, any> = {}
  
  blocks.forEach(block => {
    const { id, ...blockData } = block
    if (id) {
      jsonBlocks[id] = blockData
    }
  })
  
  return jsonBlocks
}

/**
 * Get display title for a page block type
 */
export function getPageBlockTitle(blockType: string): string {
  const titles: Record<string, string> = {
    'navigation': 'Navigation',
    'hero': 'Hero Section',
    'footer': 'Footer',
    'rich-text': 'Rich Text',
    'faq': 'FAQ Section',
    'divider': 'Divider',
    'image-text': 'Image + Text',
    'listing-views': 'Listing Views'
  }
  
  return titles[blockType] || blockType
}

/**
 * Generate a unique block ID
 */
export function generatePageBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}