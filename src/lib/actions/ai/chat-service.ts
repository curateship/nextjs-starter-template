/**
 * Chat Service
 * Handles chat-based refinement of AI-generated content
 */

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { GeneratedBlock, AIMessage } from '@/lib/actions/ai/types'
import { getChatRefinementPrompt } from './prompt-templates'

/**
 * Extract JSON from AI response
 */
function extractJSON(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
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
 * Chat session for iterative content refinement
 */
export class ChatSession {
  private currentBlocks: GeneratedBlock[]
  private messages: AIMessage[]
  private modelId: string

  constructor(initialBlocks: GeneratedBlock[], modelId: string = 'gpt-4o-mini') {
    this.currentBlocks = initialBlocks
    this.messages = []
    this.modelId = modelId
  }

  /**
   * Send a refinement message and get updated blocks
   */
  async sendMessage(userMessage: string): Promise<{
    blocks: GeneratedBlock[]
    message: AIMessage
  }> {
    try {
      // Add user message to history
      const userMsg: AIMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      }
      this.messages.push(userMsg)

      // Generate AI response
      const { text } = await generateText({
        model: openai(this.modelId),
        prompt: `${getChatRefinementPrompt(this.currentBlocks)}\n\nUser request: ${userMessage}`,
        temperature: 0.3 // Lower temperature for precise instruction following
      })

      // Parse response
      const response = extractJSON(text)

      if (!response.blocks || !Array.isArray(response.blocks)) {
        throw new Error('AI response missing blocks array')
      }

      // Validate that all original blocks are present
      if (response.blocks.length !== this.currentBlocks.length) {
        console.warn('Block count mismatch. Using AI response anyway.')
      }

      // Update current blocks
      this.currentBlocks = response.blocks

      // Get explanation from AI response or use default
      const explanation = response.explanation || `I've updated the blocks based on your request.`

      // Create assistant message with explanation
      const assistantMsg: AIMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: explanation,
        timestamp: new Date()
      }
      this.messages.push(assistantMsg)

      return {
        blocks: this.currentBlocks,
        message: assistantMsg
      }
    } catch (error) {
      console.error('Chat refinement error:', error)
      throw new Error(`Failed to refine content: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get current blocks
   */
  getCurrentBlocks(): GeneratedBlock[] {
    return this.currentBlocks
  }

  /**
   * Get message history
   */
  getMessages(): AIMessage[] {
    return this.messages
  }
}
