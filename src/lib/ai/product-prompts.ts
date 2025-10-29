/**
 * Product-Specific AI Prompt Templates
 * Prompts specifically designed for product content generation
 */

import type { BlockType } from '@/lib/ai/types'

/**
 * Get the system prompt for auto-selecting product block types
 */
export function getProductAutoSelectPrompt(): string {
  return `You are an expert content strategist for product pages. Based on the user's product description, select 3-5 relevant block types from this list:

MANDATORY BLOCKS (always include these in this order):
1. product-hero: Hero section with headline, description, CTA (REQUIRED - ALWAYS FIRST)
2. product-features: List of product features with icons (REQUIRED - ALWAYS SECOND)
3. faq: Frequently asked questions (REQUIRED - ALWAYS THIRD)

OPTIONAL BLOCKS (add 0-2 if relevant):
- product-hotspot: Interactive image with clickable hotspots
- product-pricing: Pricing tiers and plans
- product-video: Video embed section
- rich-text: Rich text content block

IMPORTANT: Always include the 3 mandatory blocks first, in that exact order: ["product-hero", "product-features", "faq"]

Return ONLY a JSON array of block type strings, like: ["product-hero", "product-features", "faq", "product-pricing"]

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

    'product-hotspot': `Generate a product hotspot block with the following JSON structure:
{
  "title": "Interactive section title",
  "subtitle": "Section subtitle",
  "imageUrl": "/images/product-demo.jpg",
  "hotspots": [
    {
      "x": 30,
      "y": 45,
      "title": "Feature name",
      "description": "Feature description"
    }
  ]
}

x and y are percentages (0-100) for hotspot positioning.
User's product description: ${userPrompt}

Generate 3-5 hotspots. Return ONLY valid JSON, no explanatory text.`,

    'product-pricing': `Generate a product pricing block with the following JSON structure:
{
  "title": "Pricing section title",
  "subtitle": "Pricing subtitle",
  "tiers": [
    {
      "name": "Plan name",
      "price": "29",
      "period": "month",
      "description": "Plan description",
      "features": [
        { "text": "Feature description", "included": true }
      ],
      "cta": "Button text",
      "highlighted": false
    }
  ]
}

User's product description: ${userPrompt}

Generate 2-3 pricing tiers. Return ONLY valid JSON, no explanatory text.`,

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

    'product-video': `Generate a product video block with the following JSON structure:
{
  "title": "Video section title",
  "subtitle": "Video subtitle",
  "videoUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "description": "Video description"
}

User's product description: ${userPrompt}

Return ONLY valid JSON, no explanatory text.`,

    'rich-text': `Generate a rich text content block with the following JSON structure:
{
  "title": "Content section title",
  "content": "Rich HTML content with <p>, <h2>, <h3>, <ul>, <li> tags"
}

User's product description: ${userPrompt}

Generate informative content about the product. Return ONLY valid JSON, no explanatory text.`
  }

  return blockPrompts[blockType] || ''
}
