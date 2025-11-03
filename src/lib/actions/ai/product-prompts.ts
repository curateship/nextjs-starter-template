/**
 * Product-Specific AI Prompt Templates
 * Prompts specifically designed for product content generation
 */

import type { BlockType } from '@/lib/actions/ai/types'

/**
 * Get the system prompt for auto-selecting product block types
 */
export function getProductAutoSelectPrompt(): string {
  return `You are an expert content strategist for product pages. For all product pages, you will generate these 3 essential blocks in this exact order:

BLOCKS (always include all 3 in this order):
1. product-hero: Hero section with headline, description, CTA (REQUIRED - ALWAYS FIRST)
2. product-features: List of product features with icons (REQUIRED - ALWAYS SECOND)
3. faq: Frequently asked questions (REQUIRED - ALWAYS THIRD)

Return ONLY this JSON array: ["product-hero", "product-features", "faq"]

Do not include any explanatory text, just the JSON array.`
}

/**
 * Get the system prompt for generating a specific product block type
 */
export function getProductBlockGenerationPrompt(blockType: BlockType, userPrompt: string): string {
  const blockPrompts: Record<BlockType, string> = {
    'product-hero': `Generate a product hero block with the following JSON structure:
{
  "title": "Compelling product headline",
  "subtitle": "Engaging subheadline or value proposition",
  "description": "Brief description of the product",
  "primaryCTA": "Primary button text",
  "primaryCTALink": "/products/signup",
  "secondaryCTA": "Secondary button text (optional)",
  "secondaryCTALink": "/learn-more"
}

User's product description: ${userPrompt}

Return ONLY valid JSON, no explanatory text.`,

    'product-features': `Generate a product features block with the following JSON structure:
{
  "title": "Features section title",
  "subtitle": "Features section subtitle",
  "features": [
    {
      "title": "Feature name",
      "description": "Feature description",
      "icon": "IconName"
    }
  ]
}

Use these icon names only: Zap, Shield, Gauge, Sparkles, Layers, TrendingUp, Lock, Users, Globe, Heart, Star, CheckCircle

User's product description: ${userPrompt}

Generate 4-6 features. Return ONLY valid JSON, no explanatory text.`,

    'faq': `Generate a FAQ block with the following JSON structure:
{
  "title": "FAQ section title",
  "subtitle": "FAQ subtitle",
  "questions": [
    {
      "question": "Question text",
      "answer": "Answer text"
    }
  ]
}

User's product description: ${userPrompt}

Generate 4-6 FAQ items. Return ONLY valid JSON, no explanatory text.`,

    'product-hotspot': `Generate a product hotspot block. Return ONLY valid JSON, no explanatory text.`,
    'product-checkout': `Generate a product checkout block. Return ONLY valid JSON, no explanatory text.`,
    'product-video': `Generate a product video block. Return ONLY valid JSON, no explanatory text.`,
    'rich-text': `Generate rich text content. Return ONLY valid JSON, no explanatory text.`
  }

  return blockPrompts[blockType] || ''
}
