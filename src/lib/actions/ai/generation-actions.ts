/**
 * AI Generation Actions
 * Server actions for AI-powered content generation
 */

'use server'

import type { BlockType, GeneratedBlock, AIMessage } from '@/types/ai-generation'
import { autoSelectBlocks, generateBlocks } from '@/lib/ai/generation-service'
import { ChatSession } from '@/lib/ai/chat-service'
import { sanitizeBlocks } from '@/lib/ai/content-sanitizer'
import { normalizeBlocks } from '@/lib/ai/field-normalizer'
import { getProductByIdAction, updateProductBlocksAction } from '@/lib/actions/products/product-actions'

/**
 * Generate initial content blocks
 * Returns blocks to client for preview (does not save to database)
 */
export async function generateContentBlocksAction(params: {
  prompt: string
  blockTypes: 'auto' | BlockType[]
  modelId: string
  contentType: string
  siteId?: string
}): Promise<{
  success: boolean
  blocks?: GeneratedBlock[]
  error?: string
}> {
  try {
    // Validate prompt
    if (!params.prompt || params.prompt.trim().length < 10) {
      return {
        success: false,
        error: 'Prompt must be at least 10 characters'
      }
    }

    // Determine which blocks to generate
    let blockTypesToGenerate: BlockType[]

    if (params.blockTypes === 'auto') {
      // Auto-select blocks based on prompt
      blockTypesToGenerate = await autoSelectBlocks(params.prompt, params.modelId)
    } else {
      blockTypesToGenerate = params.blockTypes
    }

    // Generate blocks
    const generatedBlocks = await generateBlocks(
      blockTypesToGenerate,
      params.prompt,
      params.modelId
    )

    if (generatedBlocks.length === 0) {
      return {
        success: false,
        error: 'Failed to generate any blocks'
      }
    }

    // Sanitize and normalize
    const sanitized = sanitizeBlocks(generatedBlocks)
    const normalized = normalizeBlocks(sanitized)

    return {
      success: true,
      blocks: normalized
    }
  } catch (error) {
    console.error('Generate content blocks error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate content'
    }
  }
}

/**
 * Generate single block for block-level AI chat
 * Returns block content to client for preview (does not save to database)
 */
export async function generateSingleBlockAction(params: {
  blockType: BlockType
  prompt: string
  modelId: string
}): Promise<{
  success: boolean
  content?: any
  error?: string
}> {
  try {
    // Validate prompt
    if (!params.prompt || params.prompt.trim().length < 10) {
      return {
        success: false,
        error: 'Prompt must be at least 10 characters'
      }
    }

    // Generate single block
    const { generateSingleBlock } = await import('@/lib/ai/generation-service')
    const result = await generateSingleBlock(
      params.blockType,
      params.prompt,
      params.modelId
    )

    return {
      success: true,
      content: result.content
    }
  } catch (error) {
    console.error('Generate single block error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate block'
    }
  }
}

/**
 * Refine content through chat
 * Returns updated blocks to client for preview (does not save to database)
 */
export async function refineChatContentAction(params: {
  messages: AIMessage[]
  currentBlocks: GeneratedBlock[]
  modelId: string
  contentType: string
  siteId?: string
  userMessage: string
}): Promise<{
  success: boolean
  updatedBlocks?: GeneratedBlock[]
  message?: AIMessage
  error?: string
}> {
  try {
    // Create chat session with current blocks
    const chatSession = new ChatSession(params.currentBlocks, params.modelId)

    // Send user message and get updated blocks
    const { blocks, message } = await chatSession.sendMessage(params.userMessage)

    // Sanitize and normalize updated blocks
    const sanitized = sanitizeBlocks(blocks)
    const normalized = normalizeBlocks(sanitized)

    return {
      success: true,
      updatedBlocks: normalized,
      message
    }
  } catch (error) {
    console.error('Refine chat content error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refine content'
    }
  }
}

/**
 * Apply AI-generated blocks to product
 * Saves blocks to database
 */
export async function applyAIBlocksToProductAction(
  productId: string,
  blocks: GeneratedBlock[]
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Fetch existing product
    const { data: product, error: fetchError } = await getProductByIdAction(productId)

    if (fetchError || !product) {
      return {
        success: false,
        error: fetchError || 'Product not found'
      }
    }

    // Get existing content blocks (object keyed by block type)
    const existingBlocks = (product.content_blocks as Record<string, any>) || {}

    // Convert AI blocks to object keyed by block type
    // updateProductBlocksAction expects: { "block-type": { content } }
    const newBlocksObject: Record<string, any> = {}
    blocks.forEach(block => {
      newBlocksObject[block.type] = block.content
    })

    // Merge with existing blocks (new blocks override existing ones of same type)
    const mergedBlocks = {
      ...existingBlocks,
      ...newBlocksObject
    }

    // Save to database
    const { success, error: saveError } = await updateProductBlocksAction(
      productId,
      mergedBlocks
    )

    if (!success) {
      return {
        success: false,
        error: saveError || 'Failed to save blocks'
      }
    }

    return {
      success: true
    }
  } catch (error) {
    console.error('Apply AI blocks error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply blocks'
    }
  }
}
