import { useState, useEffect } from 'react'
import { 
  getPostBlocksAction, 
  updatePostBlocksAction, 
  addPostBlockAction, 
  deletePostBlockAction,
  type PostBlock 
} from '@/lib/actions/posts/post-actions'

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
  handleAddRichTextBlock: () => Promise<void>
  handleDeleteBlock: (block: PostBlock) => Promise<void>
  handleUpdateBlock: (blockId: string, updates: Partial<PostBlock>) => Promise<void>
  handleReorderBlocks: (newOrder: { id: string; display_order: number }[]) => Promise<void>
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

  // Add a new rich text block
  const handleAddRichTextBlock = async () => {
    if (!postId || postId.length === 0) {
      setSaveMessage('No post selected')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    
    try {
      setSaveMessage('Adding block...')
      
      const { data: newBlock, error } = await addPostBlockAction(
        postId,
        'rich-text',
        { title: '', body: '', format: 'html' }
      )

      if (error || !newBlock) {
        console.error('Error adding rich text block:', error)
        setSaveMessage('Error adding block')
        setTimeout(() => setSaveMessage(''), 3000)
        return
      }

      // Update blocks using setBlocks
      setBlocks(prev => ({
        ...prev,
        [newBlock.id]: newBlock
      }))
      
      setSelectedBlock(newBlock)
      setSaveMessage('Block added!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      console.error('Error adding rich text block:', err)
      setSaveMessage('Error adding block')
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  // Delete a block
  const handleDeleteBlock = async (block: PostBlock) => {
    if (!postId || postId.length === 0) {
      setSaveMessage('No post selected')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    
    try {
      setSaveMessage('Deleting block...')

      const { success, error } = await deletePostBlockAction(postId, block.id)

      if (!success || error) {
        console.error('Error deleting block:', error)
        setSaveMessage('Error deleting block')
        setTimeout(() => setSaveMessage(''), 3000)
        return
      }

      // Update local state
      setBlocks(prev => {
        const { [block.id]: removed, ...rest } = prev
        return rest
      })

      // Clear selection if deleted block was selected
      if (selectedBlock?.id === block.id) {
        setSelectedBlock(null)
      }

      setSaveMessage('Block deleted!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      console.error('Error deleting block:', err)
      setSaveMessage('Error deleting block')
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  // Update a block
  const handleUpdateBlock = async (blockId: string, updates: Partial<PostBlock>) => {
    if (!postId || postId.length === 0) {
      setSaveMessage('No post selected')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    
    try {
      const currentBlock = blocks[blockId]
      if (!currentBlock) return

      const updatedBlock = {
        ...currentBlock,
        ...updates,
        updated_at: new Date().toISOString()
      }

      // Update local state immediately
      setBlocks(prev => ({
        ...prev,
        [blockId]: updatedBlock
      }))

      // Update selected block if it's the one being updated
      if (selectedBlock?.id === blockId) {
        setSelectedBlock(updatedBlock)
      }

      // Save to server - need to get current blocks state
      const { success, error } = await updatePostBlocksAction(postId, blocks)

      if (!success || error) {
        console.error('Error updating block:', error)
        // Revert handled by parent component
        if (selectedBlock?.id === blockId) {
          setSelectedBlock(currentBlock)
        }
        setSaveMessage('Error saving block')
        setTimeout(() => setSaveMessage(''), 3000)
      }
    } catch (err) {
      console.error('Error updating block:', err)
      setSaveMessage('Error saving block')
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  // Reorder blocks
  const handleReorderBlocks = async (newOrder: { id: string; display_order: number }[]) => {
    if (!postId || postId.length === 0) {
      setSaveMessage('No post selected')
      setTimeout(() => setSaveMessage(''), 3000)
      return
    }
    
    try {
      setSaveMessage('Reordering blocks...')

      // Update local state with new order
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

      // Save to server - need to get current blocks state
      const { success, error } = await updatePostBlocksAction(postId, blocks)

      if (!success || error) {
        console.error('Error reordering blocks:', error)
        // Revert handled by parent component
        setSaveMessage('Error reordering blocks')
        setTimeout(() => setSaveMessage(''), 3000)
        return
      }

      setSaveMessage('Blocks reordered!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (err) {
      console.error('Error reordering blocks:', err)
      setSaveMessage('Error reordering blocks')
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  return {
    blocks,
    selectedBlock,
    setSelectedBlock,
    loading,
    saveMessage,
    handleAddRichTextBlock,
    handleDeleteBlock,
    handleUpdateBlock,
    handleReorderBlocks
  }
}