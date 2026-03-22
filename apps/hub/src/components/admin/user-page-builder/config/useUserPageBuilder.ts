import { useState, useEffect } from "react"
import {
  updateUserPageBlocksAction,
  updateUserPagesSettingsAction,
  type UserPage
} from "@/lib/actions/user-pages/user-pages-actions"
import { convertBlocksToJson, generateBlockId } from "@/lib/utils/block-utils"
import { isBlockTypeProtected } from "@/lib/utils/lock-blocks-protector"
import { getBlockTypeDefinition } from "./user-page-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface UseUserPagesBuilderParams {
  siteId: string
  pages: UserPage[]
  blocks: Record<string, any[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, any[]>>>
  selectedPage: string
  reloadBlocks?: () => Promise<void>
}

interface UseUserPagesBuilderReturn {
  selectedBlock: any | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<any | null>>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: any) => Promise<void>
  handleReorderBlocks: (blocks: any[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => Promise<void>
}

export function useUserPageBuilder({
  siteId,
  pages,
  blocks,
  setBlocks,
  selectedPage,
  reloadBlocks
}: UseUserPagesBuilderParams): UseUserPagesBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
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

  // Delete block immediately from database
  const handleDeleteBlock = async (block: any) => {
    setDeleting(block.id)

    try {
      // Remove from UI immediately
      const updatedBlocks = { ...blocks }
      updatedBlocks[selectedPage] = updatedBlocks[selectedPage].filter(b => b.id !== block.id)
      setBlocks(updatedBlocks)

      // Clear selection if deleted block was selected
      if (selectedBlock?.id === block.id) {
        setSelectedBlock(null)
      }

      // Clear nav/footer from user pages settings if deleting those block types
      if (block.type === 'navigation' || block.type === 'footer') {
        const settings: { navigation?: any; footer?: any } = {}
        if (block.type === 'navigation') settings.navigation = null
        if (block.type === 'footer') settings.footer = null
        await updateUserPagesSettingsAction(siteId, settings)
      }

      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertBlocksToJson(updatedBlocks[selectedPage].filter(b => b.type !== 'navigation' && b.type !== 'footer'))
        await updateUserPageBlocksAction(currentPage.id, jsonBlocks)
      }

      // Reload blocks from database to get clean state
      if (reloadBlocks) {
        await reloadBlocks()
      }

      setSaveMessage("Block deleted!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error deleting block:', err)
      setSaveMessage("Error deleting block")
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setDeleting(null)
    }
  }

  // Handle block reordering
  const handleReorderBlocks = async (reorderedBlocks: any[]) => {
    // Store original state for rollback
    const originalBlocks = { ...blocks }

    // Get current blocks to preserve protected ones that might not be in reorderedBlocks
    const currentBlocks = blocks[selectedPage] || []
    const protectedBlocks = currentBlocks.filter(block =>
      isBlockTypeProtected(block.type)
    )

    // Combine protected blocks with reordered blocks, maintaining proper order
    // Navigation should be first, footer should be last
    const navigationBlocks = protectedBlocks.filter(b => b.type === 'navigation')
    const footerBlocks = protectedBlocks.filter(b => b.type === 'footer')
    const reorderableBlocks = reorderedBlocks.filter(b => !isBlockTypeProtected(b.type))

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

    // Save to database
    const currentPage = pages.find(p => p.slug === selectedPage)
    if (currentPage) {
      const jsonBlocks = convertBlocksToJson(finalBlocks)
      const { data, error } = await updateUserPageBlocksAction(currentPage.id, jsonBlocks)

      if (error) {
        // Rollback to original state
        setBlocks(originalBlocks)
        setSaveMessage(`Error reordering blocks: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      }
    }
  }

  // Save all block customizations
  const handleSaveAllBlocks = async () => {
    const hasActiveBlocks = blocks[selectedPage] && blocks[selectedPage].length > 0

    if (!hasActiveBlocks) {
      setSaveMessage("No changes to save")
      setTimeout(() => setSaveMessage(""), 2000)
      return
    }

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      // Find the current page
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (!currentPage) {
        setSaveMessage("Error: Page not found")
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }

      // Separate navigation/footer blocks from user page blocks
      const pageBlocks = blocks[selectedPage].filter(block =>
        block.type !== 'navigation' && block.type !== 'footer'
      )
      const navigationBlock = blocks[selectedPage].find(block => block.type === 'navigation')
      const footerBlock = blocks[selectedPage].find(block => block.type === 'footer')

      // Save navigation and footer to user pages config
      const savePromises = []

      if (navigationBlock || footerBlock) {
        const settings: { navigation?: any; footer?: any } = {}
        if (navigationBlock) settings.navigation = navigationBlock.content
        if (footerBlock) settings.footer = footerBlock.content
        savePromises.push(updateUserPagesSettingsAction(siteId, settings))
      }

      // Save page blocks to user pages table
      if (pageBlocks.length > 0) {
        const jsonBlocks = convertBlocksToJson(pageBlocks)
        savePromises.push(updateUserPageBlocksAction(currentPage.id, jsonBlocks))
      }

      // Execute all saves in parallel
      const results = await Promise.all(savePromises)

      // Check for any errors
      const errors = results.filter(result => result.error)
      if (errors.length > 0) {
        setSaveMessage(`Error: ${errors[0].error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else {
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (error) {
      console.error('Error saving blocks:', error)
      setSaveMessage("Error saving blocks")
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  // Add multiple blocks from modal selection
  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedPage] || []
    const newBlocksToAdd: any[] = []

    // Process each selection
    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      // Create the specified quantity of blocks
      for (let i = 0; i < selection.quantity; i++) {
        const newBlock = {
          id: generateBlockId(),
          type: selection.type,
          content: { ...blockDefinition.defaultContent },
          display_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        newBlocksToAdd.push(newBlock)
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    // Find proper insertion point (after navigation, before footer)
    const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
    const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')

    let insertIndex = currentBlocks.length
    if (footerIndex !== -1) {
      insertIndex = footerIndex
    } else if (navIndex !== -1) {
      insertIndex = navIndex + 1
    }

    // Insert new blocks at the proper position
    const newBlocks = [...currentBlocks]
    newBlocks.splice(insertIndex, 0, ...newBlocksToAdd)

    // Update display orders
    newBlocks.forEach((b, idx) => {
      b.display_order = idx
    })

    updatedBlocks[selectedPage] = newBlocks
    setBlocks(updatedBlocks)

    // Select the last added block
    if (newBlocksToAdd.length > 0) {
      setSelectedBlock(newBlocksToAdd[newBlocksToAdd.length - 1])
    }
  }

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    deleting,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
