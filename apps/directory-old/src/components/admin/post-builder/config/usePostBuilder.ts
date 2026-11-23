import { useState, useEffect, useRef } from 'react'
import {
  updatePostBlocksAction,
  type PostBlock
} from '@/lib/actions/posts/post-actions'
import { normalizePostBlockContent } from '@/lib/actions/posts/post-layout'
import { normalizePostBuilderBlock, postBuilderBlocksToRecord, parsePostBlocksFromJson } from './post-block-utils'
import { getBlockTypeDefinition } from './post-block-types'
import { postBlocksToValueJson } from '@/lib/actions/posts/post-template-inheritance'
import { hasSaveableChange, type SaveStatus, useSaveStatus } from '@/components/admin/layout/builder/save-status'
import { AUTO_SAVE_DEBOUNCE_MS } from '@/components/admin/layout/builder/use-auto-save'
import { type BlockSelection } from "@/components/admin/layout/builder/BlockSelectionModal"


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
  isSaving: boolean
  saveStatus: SaveStatus
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleDeleteBlock: (block: PostBlock) => void
  handleUpdateBlock: (blockId: string, updates: Partial<PostBlock>) => void
  handleReorderBlocks: (newOrder: PostBlock[]) => void
  handleCleanupCorrupted: () => void
  handleSaveAllBlocks: () => Promise<void>
}

export function usePostBuilder({ blocks, setBlocks, postId, selectedPost }: UsePostBuilderParams): PostBuilderHookResult {
  const [selectedBlock, setSelectedBlock] = useState<PostBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const withoutUpdatedAt = (block: PostBlock) => {
    const { updated_at: _updatedAt, ...rest } = block
    return rest
  }

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
      if (
        selection.type === 'table-of-contents' &&
        (currentBlocks.some((block) => block.type === 'table-of-contents') ||
          newBlocksToAdd.some((block) => block.type === 'table-of-contents'))
      ) {
        continue
      }

      const blockDefinition = getBlockTypeDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      // Create the specified quantity of blocks
      const quantity = selection.type === 'table-of-contents' ? 1 : selection.quantity
      for (let i = 0; i < quantity; i++) {
        const timestamp = Date.now() + i // Ensure unique IDs
        const newBlock: PostBlock = {
          id: `${selection.type}-${timestamp}`,
          type: selection.type as PostBlock['type'],
          display_order: ++displayOrderCounter,
          content: normalizePostBlockContent(selection.type, { ...blockDefinition.defaultContent }),
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
    setSaveStatus("dirty")
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
    setSaveStatus("dirty")
  }

  // Update a block (local state only)
  const handleUpdateBlock = (blockId: string, updates: Partial<PostBlock>) => {
    const currentBlock = blocks[blockId]
    if (!currentBlock) return

    const nextType = updates.type || currentBlock.type
    const updatedBlock = normalizePostBuilderBlock({
      ...currentBlock,
      ...updates,
      type: nextType,
      content: normalizePostBlockContent(nextType, updates.content || currentBlock.content),
      updated_at: new Date().toISOString()
    })
    if (!hasSaveableChange(
      withoutUpdatedAt(normalizePostBuilderBlock(currentBlock)),
      withoutUpdatedAt(updatedBlock)
    )) return

    // Update local state only - no immediate server save
    setBlocks(prev => ({
      ...prev,
      [blockId]: updatedBlock
    }))

    // Update selected block if it's the one being updated
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
    setSaveStatus("dirty")
  }

  // Reorder blocks (local-first)
  const handleReorderBlocks = (newOrder: PostBlock[]) => {
    const updated = postBuilderBlocksToRecord(newOrder.map((block) => ({
      ...block,
      updated_at: new Date().toISOString(),
    })))
    const currentOrder = Object.values(blocks).map((block) => block.id)
    const nextOrder = Object.values(updated).map((block) => block.id)
    if (!hasSaveableChange(currentOrder, nextOrder)) return

    setBlocks(updated)
    if (selectedBlock) {
      setSelectedBlock(updated[selectedBlock.id] || null)
    }
    setSaveStatus("dirty")
  }

  // Clean up corrupted blocks (local-first)
  const handleCleanupCorrupted = () => {
    // Filter out any corrupted blocks (blocks without id or type)
    const cleanBlocks: Record<string, PostBlock> = {}
    Object.entries(blocks).forEach(([key, block]) => {
      if (block && typeof block === 'object' && block.id && block.type) {
        cleanBlocks[key] = normalizePostBuilderBlock(block)
      }
    })

    // Update local state only
    setBlocks(cleanBlocks)
    setSaveStatus("dirty")
  }

  // Save all blocks to server (like page builder)
  const handleSaveAllBlocks = async () => {
    if (!postId || postId.length === 0) {
      setSaveStatus("error", "No post selected")
      return
    }

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const normalizedBlocks = postBuilderBlocksToRecord(Object.values(blocks))
      const valueBlocks = postBlocksToValueJson(parsePostBlocksFromJson(normalizedBlocks))
      const { success, error } = await updatePostBlocksAction({ data: { postId: postId, blocks: valueBlocks } })

      if (!success || error) {
        console.error('Error saving blocks:', error)
        setSaveStatus("error", error || "Error saving blocks")
        return
      }

      setBlocks(normalizedBlocks)
      setSaveStatus("saved")
    } catch (err) {
      console.error('Error saving blocks:', err)
      setSaveStatus("error", "Error saving blocks")
    } finally {
      setIsSaving(false)
    }
  }

  // Auto-save: block edits only mark things unsaved, so write them once the
  // typing stops. Same wait as everywhere else — see use-auto-save.ts.
  const saveAllBlocksRef = useRef(handleSaveAllBlocks)
  saveAllBlocksRef.current = handleSaveAllBlocks
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  useEffect(() => {
    if (saveStatus.state !== "dirty") return

    const timer = setTimeout(() => {
      void saveAllBlocksRef.current()
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // Leaving the screen inside that wait must not lose the edit.
  useEffect(() => {
    return () => {
      if (saveStatusRef.current.state === "dirty") {
        void saveAllBlocksRef.current()
      }
    }
  }, [])

  return {
    blocks,
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveStatus,
    handleAddBlocks,
    handleDeleteBlock,
    handleUpdateBlock,
    handleReorderBlocks,
    handleCleanupCorrupted,
    handleSaveAllBlocks
  }
}
