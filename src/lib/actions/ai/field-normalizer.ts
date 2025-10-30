/**
 * Field Normalizer
 * Maps AI-generated field names to component prop names and ensures data consistency
 */

import type { GeneratedBlock } from '@/lib/actions/ai/types'

/**
 * Ensure all items in an array have unique IDs
 */
function ensureIds(items: any[]): any[] {
  return items.map((item, index) => ({
    ...item,
    id: item.id || `item-${Date.now()}-${index}`
  }))
}

/**
 * Normalize FAQ block content
 * Maps: questions → faqItems, description → subtitle
 */
function normalizeFAQBlock(content: any): any {
  const normalized = { ...content }

  // Map questions → faqItems
  if (content.questions && !content.faqItems) {
    normalized.faqItems = ensureIds(content.questions)
    delete normalized.questions
  } else if (content.faqItems) {
    normalized.faqItems = ensureIds(content.faqItems)
  }

  // Map description → subtitle
  if (content.description && !content.subtitle) {
    normalized.subtitle = content.description
    delete normalized.description
  }

  return normalized
}

/**
 * Normalize features block content
 * Ensures all features have IDs
 */
function normalizeFeaturesBlock(content: any): any {
  const normalized = { ...content }

  if (content.features && Array.isArray(content.features)) {
    normalized.features = ensureIds(content.features)
  }

  return normalized
}

/**
 * Normalize a single block based on its type
 */
export function normalizeBlock(block: GeneratedBlock): GeneratedBlock {
  let normalized = { ...block }

  switch (block.type) {
    case 'faq':
      normalized.content = normalizeFAQBlock(block.content)
      break
    case 'product-features':
      normalized.content = normalizeFeaturesBlock(block.content)
      break
    case 'product-hero':
      // Product hero doesn't need special normalization
      normalized.content = block.content
      break
    default:
      // For other block types, just ensure the content is valid
      normalized.content = block.content
  }

  return normalized
}

/**
 * Normalize an array of blocks
 */
export function normalizeBlocks(blocks: GeneratedBlock[]): GeneratedBlock[] {
  return blocks.map(block => normalizeBlock(block))
}
