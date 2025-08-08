import { useState } from "react"
import { saveSiteBlockAction, deleteSiteBlockAction, addSiteBlockAction, type Block } from "@/lib/actions/site-blocks-actions"

interface UseSiteBuilderParams {
  siteId: string
  blocks: Record<string, Block[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, Block[]>>>
  selectedPage: string
}

interface UseSiteBuilderReturn {
  selectedBlock: Block | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<Block | null>>
  deletedBlockIds: Set<string>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: Block) => void
  handleAddHeroBlock: () => Promise<void>
  handleSaveAllBlocks: () => Promise<void>
}

export function useSiteBuilder({ 
  siteId, 
  blocks, 
  setBlocks, 
  selectedPage 
}: UseSiteBuilderParams): UseSiteBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [deletedBlockIds, setDeletedBlockIds] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

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
    const blockTypeName = block.type === 'hero' ? 'Hero Section' : 
                         block.type === 'navigation' ? 'Navigation' :
                         block.type === 'footer' ? 'Footer' : 'Block'
    
    if (!confirm(`Are you sure you want to delete the ${blockTypeName} block? It will be removed when you save.`)) {
      return
    }

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
        const currentBlocks = updatedBlocks[selectedPage]
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

  return {
    selectedBlock,
    setSelectedBlock,
    deletedBlockIds,
    isSaving,
    saveMessage,
    deleting,
    updateBlockContent,
    handleDeleteBlock,
    handleAddHeroBlock,
    handleSaveAllBlocks
  }
}