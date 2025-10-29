/**
 * AI Generation Service
 * Core service for generating content blocks using OpenAI
 */

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { BlockType, GeneratedBlock } from '@/lib/ai/types'
import { getAutoSelectPrompt, getBlockGenerationPrompt } from './prompt-templates'

/**
 * Extract JSON from AI response
 * Handles cases where AI includes text before/after JSON
 */
function extractJSON(text: string): any {
  // Try to parse directly first
  try {
    return JSON.parse(text)
  } catch {
    // Look for JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch {
        throw new Error('Failed to parse JSON from AI response')
      }
    }
    throw new Error('No valid JSON found in AI response')
  }
}

/**
 * Auto-select relevant block types based on user prompt
 */
export async function autoSelectBlocks(
  userPrompt: string,
  modelId: string = 'gpt-4o-mini'
): Promise<BlockType[]> {
  try {
    const { text } = await generateText({
      model: openai(modelId),
      prompt: `${getAutoSelectPrompt()}\n\nUser's product description:\n${userPrompt}`,
      temperature: 0.7
    })

    const blocks = extractJSON(text)

    if (!Array.isArray(blocks)) {
      throw new Error('AI response is not an array')
    }

    // Validate and filter block types
    const validBlockTypes: BlockType[] = [
      'product-hero',
      'product-features',
      'product-hotspot',
      'product-pricing',
      'faq',
      'product-video',
      'rich-text'
    ]

    const selected = blocks.filter(b => validBlockTypes.includes(b as BlockType)) as BlockType[]

    // Ensure we have at least product-hero
    if (!selected.includes('product-hero')) {
      selected.unshift('product-hero')
    }

    return selected.slice(0, 5) // Max 5 blocks
  } catch (error) {
    console.error('Auto-select blocks error:', error)
    // Fallback to default blocks
    return ['product-hero', 'product-features', 'faq']
  }
}

/**
 * Generate a single content block
 */
export async function generateSingleBlock(
  blockType: BlockType,
  userPrompt: string,
  modelId: string = 'gpt-4o-mini'
): Promise<GeneratedBlock> {
  try {
    const { text } = await generateText({
      model: openai(modelId),
      prompt: getBlockGenerationPrompt(blockType, userPrompt),
      temperature: 0.8
    })

    const content = extractJSON(text)

    return {
      id: `${blockType}-${Date.now()}`,
      type: blockType,
      content
    }
  } catch (error) {
    console.error(`Generate ${blockType} block error:`, error)
    throw new Error(`Failed to generate ${blockType} block: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generate multiple content blocks
 */
export async function generateBlocks(
  blockTypes: BlockType[],
  userPrompt: string,
  modelId: string = 'gpt-4o-mini'
): Promise<GeneratedBlock[]> {
  const blocks: GeneratedBlock[] = []

  // Generate blocks sequentially to avoid rate limits
  for (const blockType of blockTypes) {
    try {
      const block = await generateSingleBlock(blockType, userPrompt, modelId)
      blocks.push(block)
    } catch (error) {
      console.error(`Failed to generate ${blockType}:`, error)
      // Continue with other blocks even if one fails
    }
  }

  return blocks
}
