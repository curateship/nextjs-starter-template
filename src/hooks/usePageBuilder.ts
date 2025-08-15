import { useState, useEffect } from "react"
import { saveSiteBlockAction, deleteSiteBlockAction, addSiteBlockAction, reorderSiteBlocksAction, type Block } from "@/lib/actions/page-blocks-actions"
import { isBlockTypeProtected } from "@/lib/shared-blocks/block-utils"

interface UsePageBuilderParams {
  siteId: string
  blocks: Record<string, Block[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, Block[]>>>
  selectedPage: string
  reloadBlocks?: () => Promise<void>
}

interface UsePageBuilderReturn {
  selectedBlock: Block | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<Block | null>>
  deletedBlockIds: Set<string>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: Block) => void
  handleReorderBlocks: (blocks: Block[]) => void
  handleAddHeroBlock: () => Promise<void>
  handleAddRichTextBlock: () => Promise<void>
  handleAddFaqBlock: () => Promise<void>
  handleSaveAllBlocks: () => Promise<void>
}

export function usePageBuilder({ 
  siteId, 
  blocks, 
  setBlocks, 
  selectedPage,
  reloadBlocks
}: UsePageBuilderParams): UsePageBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [deletedBlockIds, setDeletedBlockIds] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  // Reset selected block when page changes
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPage])

  // Helper function to update block content
  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return
    
    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedPage][blockIndex] = {
        ...updatedBlocks[selectedPage][blockIndex],
        content: {
          ...updatedBlocks[selectedPage][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
    }
  }

  // Stage a block for deletion (doesn't delete until save)
  const handleDeleteBlock = (block: Block) => {
    // Add to staged deletions
    setDeletedBlockIds(prev => new Set(prev).add(block.id))
    
    // Clear selection if deleted block was selected
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
    
    setSaveMessage("Block marked for deletion. Click Save to apply changes.")
    setTimeout(() => setSaveMessage(""), 3000)
  }

  // Add a new hero block
  const handleAddHeroBlock = async () => {
    try {
      const { success, block, error } = await addSiteBlockAction({
        site_id: siteId,
        page_slug: selectedPage as 'home' | 'about' | 'contact',
        block_type: 'hero'
      })
      
      if (error) {
        setSaveMessage(`Error: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }
      
      if (success && block) {
        // Add to local state with proper positioning
        const updatedBlocks = { ...blocks }
        const currentBlocks = updatedBlocks[selectedPage] || []
        const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
        const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
        
        if (footerIndex >= 0) {
          // Insert before footer
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, footerIndex),
            block,
            ...currentBlocks.slice(footerIndex)
          ]
        } else if (navIndex >= 0) {
          // Insert after navigation
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, navIndex + 1),
            block,
            ...currentBlocks.slice(navIndex + 1)
          ]
        } else {
          // No nav/footer, add at beginning
          updatedBlocks[selectedPage] = [block, ...currentBlocks]
        }
        
        setBlocks(updatedBlocks)
        setSelectedBlock(block)
        
        setSaveMessage("Hero block added!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      console.error('Error adding hero block:', err)
      setSaveMessage("Error adding hero block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  // Handle block reordering
  const handleReorderBlocks = async (reorderedBlocks: Block[]) => {
    try {
      // Get current blocks to preserve protected ones that might not be in reorderedBlocks
      const currentBlocks = blocks[selectedPage] || []
      const protectedBlocks = currentBlocks.filter(block => 
        isBlockTypeProtected(block.type) && !deletedBlockIds.has(block.id)
      )
      
      // Filter out any blocks that are marked for deletion
      const validReorderedBlocks = reorderedBlocks.filter(block => !deletedBlockIds.has(block.id))
      
      // Combine protected blocks with reordered blocks, maintaining proper order
      // Navigation should be first, footer should be last
      const navigationBlocks = protectedBlocks.filter(b => b.type === 'navigation')
      const footerBlocks = protectedBlocks.filter(b => b.type === 'footer')
      const reorderableBlocks = validReorderedBlocks.filter(b => !isBlockTypeProtected(b.type))
      
      // Build final blocks array with updated display_order
      const finalBlocks = [
        ...navigationBlocks,
        ...reorderableBlocks,
        ...footerBlocks
      ].map((block, index) => ({
        ...block,
        display_order: index
      }))
      
      // Update local state immediately for responsive UX
      const updatedBlocks = { ...blocks }
      updatedBlocks[selectedPage] = finalBlocks
      setBlocks(updatedBlocks)

      // Send reorder request to server only for reorderable blocks (not protected ones)
      const reorderableBlockIds = reorderableBlocks.map(block => block.id)
      
      // Only send reorder request if there are reorderable blocks
      if (reorderableBlockIds.length === 0) {
        setSaveMessage("No reorderable blocks")
        setTimeout(() => setSaveMessage(""), 2000)
        return
      }
      
      const { success, error } = await reorderSiteBlocksAction({
        site_id: siteId,
        page_slug: selectedPage,
        block_ids: reorderableBlockIds
      })

      if (error) {
        // Rollback on error
        const originalBlocks = { ...blocks }
        setBlocks(originalBlocks)
        setSaveMessage(`Error reordering blocks: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }

      if (success) {
        // Success - no message needed, visual feedback is sufficient
      }
    } catch (err) {
      console.error('Error reordering blocks:', err)
      // Rollback on error
      const originalBlocks = { ...blocks }
      setBlocks(originalBlocks)
      setSaveMessage("Error reordering blocks")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  // Add a new rich text block
  const handleAddRichTextBlock = async () => {
    try {
      const { success, block, error } = await addSiteBlockAction({
        site_id: siteId,
        page_slug: selectedPage as 'home' | 'about' | 'contact',
        block_type: 'rich-text'
      })
      
      if (error) {
        setSaveMessage(`Error: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }
      
      if (success && block) {
        // Add to local state with proper positioning
        const updatedBlocks = { ...blocks }
        const currentBlocks = updatedBlocks[selectedPage] || []
        const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
        const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
        
        if (footerIndex >= 0) {
          // Insert before footer
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, footerIndex),
            block,
            ...currentBlocks.slice(footerIndex)
          ]
        } else if (navIndex >= 0) {
          // Insert after navigation
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, navIndex + 1),
            block,
            ...currentBlocks.slice(navIndex + 1)
          ]
        } else {
          // No nav/footer, add at beginning
          updatedBlocks[selectedPage] = [block, ...currentBlocks]
        }
        
        setBlocks(updatedBlocks)
        setSelectedBlock(block)
        
        setSaveMessage("Rich text block added!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      console.error('Error adding rich text block:', err)
      setSaveMessage("Error adding rich text block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  // Save all block customizations
  const handleSaveAllBlocks = async () => {    
    const hasActiveBlocks = blocks[selectedPage] && blocks[selectedPage].length > 0
    const hasDeletions = deletedBlockIds.size > 0
    
    if (!hasActiveBlocks && !hasDeletions) {
      setSaveMessage("No changes to save")
      return
    }

    setIsSaving(true)
    setSaveMessage("")

    try {
      const promises: Promise<any>[] = []
      
      // Save content updates for non-deleted blocks
      if (hasActiveBlocks) {
        const savePromises = blocks[selectedPage]
          .filter(block => !deletedBlockIds.has(block.id))
          .map(async (block) => {
            return saveSiteBlockAction({
              block_id: block.id,
              content: block.content
            })
          })
        promises.push(...savePromises)
      }
      
      // Process staged deletions
      if (hasDeletions) {
        const deletePromises = Array.from(deletedBlockIds).map(async (blockId) => {
          return deleteSiteBlockAction(blockId)
        })
        promises.push(...deletePromises)
      }

      const results = await Promise.all(promises)
      
      const failedOperations = results.filter(r => !r.success)
      if (failedOperations.length > 0) {
        const firstError = failedOperations[0]?.error || 'Unknown error'
        setSaveMessage(`Error: ${firstError}`)
      } else {
        // Clear staged deletions and update local state
        if (hasDeletions) {
          const updatedBlocks = { ...blocks }
          updatedBlocks[selectedPage] = updatedBlocks[selectedPage].filter(b => !deletedBlockIds.has(b.id))
          setBlocks(updatedBlocks)
          setDeletedBlockIds(new Set())
        }
        
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (error) {
      console.error('Error saving blocks:', error)
      setSaveMessage("Error saving blocks")
    } finally {
      setIsSaving(false)
    }
  }

  // Add a new FAQ block
  const handleAddFaqBlock = async () => {
    try {
      const { success, block, error } = await addSiteBlockAction({
        site_id: siteId,
        page_slug: selectedPage as 'home' | 'about' | 'contact',
        block_type: 'faq'
      })
      
      if (error) {
        setSaveMessage(`Error: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }
      
      if (success && block) {
        // Add to local state with proper positioning
        const updatedBlocks = { ...blocks }
        const currentBlocks = updatedBlocks[selectedPage] || []
        const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
        const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
        
        if (footerIndex >= 0) {
          // Insert before footer
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, footerIndex),
            block,
            ...currentBlocks.slice(footerIndex)
          ]
        } else if (navIndex >= 0) {
          // Insert after navigation
          updatedBlocks[selectedPage] = [
            ...currentBlocks.slice(0, navIndex + 1),
            block,
            ...currentBlocks.slice(navIndex + 1)
          ]
        } else {
          // No nav/footer, add at beginning
          updatedBlocks[selectedPage] = [block, ...currentBlocks]
        }
        
        setBlocks(updatedBlocks)
        setSelectedBlock(block)
        
        setSaveMessage("FAQ block added!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      console.error('Error adding FAQ block:', err)
      setSaveMessage("Error adding FAQ block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  return {
    selectedBlock,
    setSelectedBlock,
    deletedBlockIds,
    isSaving,
    saveMessage,
    deleting,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddHeroBlock,
    handleAddRichTextBlock,
    handleAddFaqBlock,
    handleSaveAllBlocks
  }
}