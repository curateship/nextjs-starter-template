/**
 * AI Generation Service
 * Core service for generating content blocks using OpenAI
 */

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { BlockType, GeneratedBlock } from '@/lib/actions/ai/types'
import { getProductAutoSelectPrompt, getProductBlockGenerationPrompt } from './product-prompts'

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
  // Mandatory blocks in order of importance
  const mandatoryBlocks: BlockType[] = ['product-hero', 'product-features', 'faq']

  try {
    const { text } = await generateText({
      model: openai(modelId),
      prompt: `${getProductAutoSelectPrompt()}\n\nUser's product description:\n${userPrompt}`,
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
      'faq'
    ]

    const selected = blocks.filter(b => validBlockTypes.includes(b as BlockType)) as BlockType[]

    // Ensure mandatory blocks are present and in correct order
    const result: BlockType[] = []

    // Add mandatory blocks first in order
    for (const mandatoryBlock of mandatoryBlocks) {
      if (!result.includes(mandatoryBlock)) {
        result.push(mandatoryBlock)
      }
    }

    // Add optional blocks (if not already included)
    for (const block of selected) {
      if (!result.includes(block)) {
        result.push(block)
      }
    }

    return result.slice(0, 3) // Max 3 blocks (all mandatory)
  } catch (error) {
    console.error('Auto-select blocks error:', error)
    // Fallback to mandatory blocks only
    return mandatoryBlocks
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
      prompt: getProductBlockGenerationPrompt(blockType, userPrompt),
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
