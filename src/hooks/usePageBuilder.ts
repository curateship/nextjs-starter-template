import { useState, useEffect } from "react"
import { updatePageBlocksAction, type Page } from "@/lib/actions/pages/page-actions"
import { updateSiteNavigationAction, updateSiteFooterAction } from "@/lib/actions/sites/site-actions"
import { convertPageBlocksToJson, generatePageBlockId } from "@/lib/utils/page-block-utils"
import { isBlockTypeProtected } from "@/lib/utils/block-utils"

interface UsePageBuilderParams {
  siteId: string
  pages: Page[]
  blocks: Record<string, any[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, any[]>>>
  selectedPage: string
  reloadBlocks?: () => Promise<void>
}

interface UsePageBuilderReturn {
  selectedBlock: any | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<any | null>>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: any) => Promise<void>
  handleReorderBlocks: (blocks: any[]) => void
  handleAddHeroBlock: () => Promise<void>
  handleAddRichTextBlock: () => Promise<void>
  handleAddFaqBlock: () => Promise<void>
  handleAddListingViewsBlock: () => Promise<void>
  handleAddDividerBlock: () => Promise<void>
  handleSaveAllBlocks: () => Promise<void>
}

export function usePageBuilder({ 
  siteId, 
  pages,
  blocks, 
  setBlocks, 
  selectedPage,
  reloadBlocks
}: UsePageBuilderParams): UsePageBuilderReturn {
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

  // Delete block immediately from database (no staging)
  const handleDeleteBlock = async (block: any) => {
    // Prevent deletion of protected blocks
    if (isBlockTypeProtected(block.type)) {
      setSaveMessage(`${block.type === 'navigation' ? 'Navigation' : 'Footer'} blocks cannot be deleted`)
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

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
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
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

  // Add a new hero block
  const handleAddHeroBlock = async () => {
    try {
      // Create new block locally
      const newBlock = {
        id: generatePageBlockId(),
        type: 'hero',
        content: {
          title: 'Welcome to Our Site',
          subtitle: 'Your subtitle here',
          buttonText: 'Get Started',
          buttonUrl: '#',
          backgroundImage: ''
        },
        display_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Add to local state with proper positioning
      const updatedBlocks = { ...blocks }
      const currentBlocks = updatedBlocks[selectedPage] || []
      const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
      const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
      
      if (footerIndex >= 0) {
        // Insert before footer
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, footerIndex),
          newBlock,
          ...currentBlocks.slice(footerIndex)
        ]
      } else if (navIndex >= 0) {
        // Insert after navigation
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, navIndex + 1),
          newBlock,
          ...currentBlocks.slice(navIndex + 1)
        ]
      } else {
        // No nav/footer, add at beginning
        updatedBlocks[selectedPage] = [newBlock, ...currentBlocks]
      }
      
      setBlocks(updatedBlocks)
      setSelectedBlock(newBlock)
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }
      
      setSaveMessage("Hero block added!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error adding hero block:', err)
      setSaveMessage("Error adding hero block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  // Handle block reordering
  const handleReorderBlocks = async (reorderedBlocks: any[]) => {
    try {
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
        const jsonBlocks = convertPageBlocksToJson(finalBlocks)
        const { success, error } = await updatePageBlocksAction(currentPage.id, jsonBlocks)
        
        if (error) {
          // Rollback on error
          const originalBlocks = { ...blocks }
          setBlocks(originalBlocks)
          setSaveMessage(`Error reordering blocks: ${error}`)
          setTimeout(() => setSaveMessage(""), 5000)
          return
        }
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
      // Create new block locally
      const newBlock = {
        id: generatePageBlockId(),
        type: 'rich-text',
        content: {
          content: '<p>Add your content here...</p>'
        },
        display_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Add to local state with proper positioning
      const updatedBlocks = { ...blocks }
      const currentBlocks = updatedBlocks[selectedPage] || []
      const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
      const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
      
      if (footerIndex >= 0) {
        // Insert before footer
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, footerIndex),
          newBlock,
          ...currentBlocks.slice(footerIndex)
        ]
      } else if (navIndex >= 0) {
        // Insert after navigation
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, navIndex + 1),
          newBlock,
          ...currentBlocks.slice(navIndex + 1)
        ]
      } else {
        // No nav/footer, add at beginning
        updatedBlocks[selectedPage] = [newBlock, ...currentBlocks]
      }
      
      setBlocks(updatedBlocks)
      setSelectedBlock(newBlock)
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }
      
      setSaveMessage("Rich text block added!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error adding rich text block:', err)
      setSaveMessage("Error adding rich text block")
      setTimeout(() => setSaveMessage(""), 5000)
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
      
      // Separate navigation/footer blocks from page blocks
      const pageBlocks = blocks[selectedPage].filter(block => 
        block.type !== 'navigation' && block.type !== 'footer'
      )
      const navigationBlock = blocks[selectedPage].find(block => block.type === 'navigation')
      const footerBlock = blocks[selectedPage].find(block => block.type === 'footer')
      
      // Save navigation and footer to sites table
      const savePromises = []
      
      if (navigationBlock) {
        savePromises.push(updateSiteNavigationAction(siteId, navigationBlock.content))
      }
      
      if (footerBlock) {
        savePromises.push(updateSiteFooterAction(siteId, footerBlock.content))
      }
      
      // Save page blocks to pages table
      if (pageBlocks.length > 0) {
        const jsonBlocks = convertPageBlocksToJson(pageBlocks)
        savePromises.push(updatePageBlocksAction(currentPage.id, jsonBlocks))
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

  // Add a new FAQ block
  const handleAddFaqBlock = async () => {
    try {
      // Create new block locally
      const newBlock = {
        id: generatePageBlockId(),
        type: 'faq',
        content: {
          faqs: [{
            question: 'Sample Question',
            answer: 'Sample answer goes here...'
          }]
        },
        display_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Add to local state with proper positioning
      const updatedBlocks = { ...blocks }
      const currentBlocks = updatedBlocks[selectedPage] || []
      const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
      const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
      
      if (footerIndex >= 0) {
        // Insert before footer
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, footerIndex),
          newBlock,
          ...currentBlocks.slice(footerIndex)
        ]
      } else if (navIndex >= 0) {
        // Insert after navigation
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, navIndex + 1),
          newBlock,
          ...currentBlocks.slice(navIndex + 1)
        ]
      } else {
        // No nav/footer, add at beginning
        updatedBlocks[selectedPage] = [newBlock, ...currentBlocks]
      }
      
      setBlocks(updatedBlocks)
      setSelectedBlock(newBlock)
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }
      
      setSaveMessage("FAQ block added!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error adding FAQ block:', err)
      setSaveMessage("Error adding FAQ block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  // Add a new Listing Views block
  const handleAddListingViewsBlock = async () => {
    try {
      // Create new block locally
      const newBlock = {
        id: generatePageBlockId(),
        type: 'listing-views',
        content: {
          title: 'Product Listings',
          viewType: 'grid'
        },
        display_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Add to local state with proper positioning
      const updatedBlocks = { ...blocks }
      const currentBlocks = updatedBlocks[selectedPage] || []
      const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
      const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
      
      if (footerIndex >= 0) {
        // Insert before footer
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, footerIndex),
          newBlock,
          ...currentBlocks.slice(footerIndex)
        ]
      } else if (navIndex >= 0) {
        // Insert after navigation
        updatedBlocks[selectedPage] = [
          ...currentBlocks.slice(0, navIndex + 1),
          newBlock,
          ...currentBlocks.slice(navIndex + 1)
        ]
      } else {
        // No nav/footer, add at beginning
        updatedBlocks[selectedPage] = [newBlock, ...currentBlocks]
      }
      
      setBlocks(updatedBlocks)
      setSelectedBlock(newBlock)
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }
      
      setSaveMessage("Listing Views block added!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error adding listing views block:', err)
      setSaveMessage("Error adding listing views block")
      setTimeout(() => setSaveMessage(""), 5000)
    }
  }

  const handleAddDividerBlock = async () => {
    try {
      // Create new block locally
      const newBlock = {
        id: generatePageBlockId(),
        type: 'divider',
        content: {
          style: 'solid',
          width: 'full',
          color: '#e5e7eb'
        },
        display_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // Add to local state with proper positioning
      const updatedBlocks = { ...blocks }
      const currentBlocks = updatedBlocks[selectedPage] || []
      const navIndex = currentBlocks.findIndex(b => b.type === 'navigation')
      const footerIndex = currentBlocks.findIndex(b => b.type === 'footer')
      
      // Position before footer but after navigation
      let insertIndex = currentBlocks.length
      if (footerIndex !== -1) {
        insertIndex = footerIndex
      } else if (navIndex !== -1) {
        insertIndex = navIndex + 1
      }
      
      const newBlocks = [...currentBlocks]
      newBlocks.splice(insertIndex, 0, newBlock)
      
      // Update display orders
      newBlocks.forEach((b, idx) => {
        b.display_order = idx
      })
      
      updatedBlocks[selectedPage] = newBlocks
      setBlocks(updatedBlocks)
      setSelectedBlock(newBlock)
      
      // Save to database
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertPageBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }
      
      setSaveMessage("Divider block added!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (error) {
      setSaveMessage("Failed to add divider block")
      setTimeout(() => setSaveMessage(""), 5000)
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
    handleAddHeroBlock,
    handleAddRichTextBlock,
    handleAddFaqBlock,
    handleAddListingViewsBlock,
    handleAddDividerBlock,
    handleSaveAllBlocks
  }
}