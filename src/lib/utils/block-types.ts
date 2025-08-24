/**
 * Common block types used across the application
 */

export interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
  display_order: number
}

export interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}