/**
 * AI Generation Types
 * Types for AI-powered content generation system
 */

export type BlockType =
  | 'product-hero'
  | 'product-features'
  | 'product-hotspot'
  | 'product-pricing'
  | 'faq'
  | 'product-video'
  | 'rich-text'

export interface GeneratedBlock {
  id: string
  type: BlockType
  content: Record<string, any>
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AIModel {
  id: string
  name: string
  description: string
  badge?: string
}
