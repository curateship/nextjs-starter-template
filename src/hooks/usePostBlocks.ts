import { useState, useCallback } from 'react'
import type { PostBlock } from '@/lib/actions/posts/post-actions'

export interface PostBlockWithId extends PostBlock {
  id: string
}

interface UsePostBlocksResult {
  blocks: Record<string, PostBlockWithId>
  selectedBlockId: string | null
  setSelectedBlockId: (id: string | null) => void
  addBlock: (type: PostBlock['type']) => void
  updateBlock: (id: string, updates: Partial<PostBlock>) => void
  deleteBlock: (id: string) => void
  reorderBlocks: (newOrder: { id: string; display_order: number }[]) => void
  getOrderedBlocks: () => PostBlockWithId[]
}

export function usePostBlocks(
  initialBlocks: Record<string, PostBlock> = {}
): UsePostBlocksResult {
  // Convert initial blocks to include proper IDs
  const [blocks, setBlocks] = useState<Record<string, PostBlockWithId>>(() => {
    const blocksWithId: Record<string, PostBlockWithId> = {}
    Object.entries(initialBlocks).forEach(([key, block]) => {
      blocksWithId[key] = {
        ...block,
        id: key
      }
    })
    return blocksWithId
  })

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const addBlock = useCallback((type: PostBlock['type']) => {
    const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const existingBlocks = Object.values(blocks)
    const maxOrder = existingBlocks.length > 0 
      ? Math.max(...existingBlocks.map(b => b.display_order))
      : 0

    const newBlock: PostBlockWithId = {
      id,
      type,
      content: getDefaultContentForType(type),
      display_order: maxOrder + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    setBlocks(prev => ({
      ...prev,
      [id]: newBlock
    }))

    setSelectedBlockId(id)
  }, [blocks])

  const updateBlock = useCallback((id: string, updates: Partial<PostBlock>) => {
    setBlocks(prev => {
      if (!prev[id]) return prev

      return {
        ...prev,
        [id]: {
          ...prev[id],
          ...updates,
          updated_at: new Date().toISOString()
        }
      }
    })
  }, [])

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const newBlocks = { ...prev }
      delete newBlocks[id]
      return newBlocks
    })

    // Clear selection if deleted block was selected
    if (selectedBlockId === id) {
      setSelectedBlockId(null)
    }
  }, [selectedBlockId])

  const reorderBlocks = useCallback((newOrder: { id: string; display_order: number }[]) => {
    setBlocks(prev => {
      const updated = { ...prev }
      newOrder.forEach(({ id, display_order }) => {
        if (updated[id]) {
          updated[id] = {
            ...updated[id],
            display_order,
            updated_at: new Date().toISOString()
          }
        }
      })
      return updated
    })
  }, [])

  const getOrderedBlocks = useCallback(() => {
    return Object.values(blocks).sort((a, b) => a.display_order - b.display_order)
  }, [blocks])

  return {
    blocks,
    selectedBlockId,
    setSelectedBlockId,
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    getOrderedBlocks
  }
}

function getDefaultContentForType(type: PostBlock['type']): Record<string, any> {
  switch (type) {
    case 'rich-text':
      return { title: '', body: '', format: 'html' }
    case 'image':
      return { url: '', alt: '', caption: '' }
    case 'code':
      return { code: '', language: 'javascript' }
    case 'quote':
      return { text: '', author: '', source: '' }
    case 'divider':
      return { style: 'line' }
    default:
      return {}
  }
}