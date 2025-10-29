/**
 * Field Normalizer
 * Maps AI-generated field names to component prop names and ensures data consistency
 */

import type { GeneratedBlock } from '@/lib/ai/types'

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
 * Normalize pricing block content
 * Ensures all tiers have IDs and features have IDs
 */
function normalizePricingBlock(content: any): any {
  const normalized = { ...content }

  if (content.tiers && Array.isArray(content.tiers)) {
    normalized.tiers = content.tiers.map((tier: any) => ({
      ...tier,
      id: tier.id || `tier-${Date.now()}-${Math.random()}`,
      features: tier.features ? ensureIds(tier.features) : []
    }))
  }

  return normalized
}

/**
 * Normalize hotspot block content
 * Ensures all hotspots have IDs
 */
function normalizeHotspotBlock(content: any): any {
  const normalized = { ...content }

  if (content.hotspots && Array.isArray(content.hotspots)) {
    normalized.hotspots = ensureIds(content.hotspots)
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
    case 'product-pricing':
      normalized.content = normalizePricingBlock(block.content)
      break
    case 'product-hotspot':
      normalized.content = normalizeHotspotBlock(block.content)
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
