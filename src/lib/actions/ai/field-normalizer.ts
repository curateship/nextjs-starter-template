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
 * Maps: questions → productFaqItems, description → subheader
 */
function normalizeFAQBlock(content: any): any {
  const normalized = { ...content }

  // Map questions → productFaqItems (AI generates 'questions', we need 'productFaqItems')
  if (content.questions && !content.productFaqItems) {
    normalized.productFaqItems = ensureIds(content.questions)
    delete normalized.questions
  } else if (content.productFaqItems) {
    normalized.productFaqItems = ensureIds(content.productFaqItems)
  }

  // Map description/subtitle → subheader (AI may generate these variants)
  if (content.description && !content.subheader) {
    normalized.subheader = content.description
    delete normalized.description
  } else if (content.subtitle && !content.subheader) {
    normalized.subheader = content.subtitle
    delete normalized.subtitle
  }

  // Map title → header (AI may generate 'title' instead of 'header')
  if (content.title && !content.header) {
    normalized.header = content.title
    delete normalized.title
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
    case 'product-faq':
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
