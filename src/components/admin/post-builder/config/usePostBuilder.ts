import { useState, useEffect } from 'react'
import {
  getPostBlocksAction,
  updatePostBlocksAction,
  addPostBlockAction,
  deletePostBlockAction,
  type PostBlock
} from '@/lib/actions/posts/post-actions'
import { getBlockTypeDefinition } from './post-block-types'

interface BlockSelection {
  type: string
  quantity: number
}

interface UsePostBuilderParams {
  blocks: Record<string, PostBlock>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, PostBlock>>>
  postId: string
  selectedPost: string
}

export interface PostBuilderHookResult {
  blocks: Record<string, PostBlock>
  selectedBlock: PostBlock | null
  setSelectedBlock: (block: PostBlock | null) => void
  loading: boolean
  saveMessage: string
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleAddPostContentBlock: () => void
  handleDeleteBlock: (block: PostBlock) => void
  handleUpdateBlock: (blockId: string, updates: Partial<PostBlock>) => void
  handleReorderBlocks: (newOrder: { id: string; display_order: number }[]) => void
  handleCleanupCorrupted: () => void
  handleSaveAllBlocks: () => Promise<void>
}

function generatePostBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}


export function usePostBuilder({ blocks, setBlocks, postId, selectedPost }: UsePostBuilderParams): PostBuilderHookResult {
  const [selectedBlock, setSelectedBlock] = useState<PostBlock | null>(null)
  const [loading, setLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  
  // Clear selection when switching posts
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPost])

  // Add multiple blocks at once (local-first, like product builder)
  const handleAddBlocks = (selections: BlockSelection[]) => {
    const currentBlocks = Object.values(blocks)
    const newBlocksToAdd: PostBlock[] = []
    let displayOrderCounter = currentBlocks.length

    // Process each selection
    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      // Create the specified quantity of blocks
      for (let i = 0; i < selection.quantity; i++) {
        const timestamp = Date.now() + i // Ensure unique IDs
        const newBlock: PostBlock = {
          id: `${selection.type}-${timestamp}`,
          type: selection.type as PostBlock['type'],
          display_order: ++displayOrderCounter,
          content: { ...blockDefinition.defaultContent },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        newBlocksToAdd.push(newBlock)
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    // Update blocks state with all new blocks
    setBlocks(prev => {
      const updated = { ...prev }
      newBlocksToAdd.forEach(block => {
        updated[block.id] = block
      })
      return updated
    })

    // Select the last added block
    if (newBlocksToAdd.length > 0) {
      setSelectedBlock(newBlocksToAdd[newBlocksToAdd.length - 1])
    }
  }

  // Add a new post content block (local-first)
  const handleAddPostContentBlock = () => {
    const currentBlocks = Object.values(blocks)
    const timestamp = Date.now()

    const newBlock: PostBlock = {
      id: `post-content-${timestamp}`,
      type: 'post-content',
      display_order: currentBlocks.length + 1,
      content: { showAuthor: true, showDate: true, body: '', format: 'html' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Update blocks using setBlocks
    setBlocks(prev => ({
      ...prev,
      [newBlock.id]: newBlock
    }))

    setSelectedBlock(newBlock)
  }

  // Delete a block (local-first)
  const handleDeleteBlock = (block: PostBlock) => {
    // Update local state
    setBlocks(prev => {
      const { [block.id]: removed, ...rest } = prev
      return rest
    })

    // Clear selection if deleted block was selected
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  // Update a block (local state only)
  const handleUpdateBlock = (blockId: string, updates: Partial<PostBlock>) => {
    const currentBlock = blocks[blockId]
    if (!currentBlock) return

    const updatedBlock = {
      ...currentBlock,
      ...updates,
      updated_at: new Date().toISOString()
    }

    // Update local state only - no immediate server save
    setBlocks(prev => ({
      ...prev,
      [blockId]: updatedBlock
    }))

    // Update selected block if it's the one being updated
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
  }

  // Reorder blocks (local-first)
  const handleReorderBlocks = (newOrder: { id: string; display_order: number }[]) => {
    // Update local state with new order
    const updated = { ...blocks }
    newOrder.forEach(({ id, display_order }) => {
      if (updated[id]) {
        updated[id] = {
          ...updated[id],
          display_order,
          updated_at: new Date().toISOString()
        }
      }
    })

    setBlocks(updated)
  }

  // Clean up corrupted blocks (local-first)
  const handleCleanupCorrupted = () => {
    // Filter out any corrupted blocks (blocks without id or type)
    const cleanBlocks: Record<string, PostBlock> = {}
    Object.entries(blocks).forEach(([key, block]) => {
      if (block && typeof block === 'object' && block.id && block.type) {
        cleanBlocks[key] = block
      }
    })

    // Update local state only
    setBlocks(cleanBlocks)
  }

  // Save all blocks to server (like page builder)
  const handleSaveAllBlocks = async () => {
    if (!postId || postId.length === 0) {
      setSaveMessage('No post selected')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    
    try {
      setSaveMessage('Saving blocks...')

      const { success, error } = await updatePostBlocksAction(postId, blocks)

      if (!success || error) {
        console.error('Error saving blocks:', error)
        setSaveMessage('Error saving blocks')
        setTimeout(() => setSaveMessage(''), 3000)
        return
      }

      setSaveMessage('All blocks saved!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      console.error('Error saving blocks:', err)
      setSaveMessage('Error saving blocks')
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  return {
    blocks,
    selectedBlock,
    setSelectedBlock,
    loading,
    saveMessage,
    handleAddBlocks,
    handleAddPostContentBlock,
    handleDeleteBlock,
    handleUpdateBlock,
    handleReorderBlocks,
    handleCleanupCorrupted,
    handleSaveAllBlocks
  }
}