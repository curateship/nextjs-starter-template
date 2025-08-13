import { useState, useEffect } from "react"
import { saveProductBlocksAction } from "@/lib/actions/product-blocks-actions"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseProductBuilderParams {
  blocks: Record<string, ProductBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, ProductBlock[]>>>
  selectedProduct: string
  productId?: string // Add product ID for saving to database
}

interface UseProductBuilderReturn {
  selectedBlock: ProductBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<ProductBlock | null>>
  deletedBlockIds: Set<string>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: ProductBlock) => void
  handleReorderBlocks: (blocks: ProductBlock[]) => void
  handleAddProductHeroBlock: () => void
  handleSaveAllBlocks: () => void
}

export function useProductBuilder({ 
  blocks, 
  setBlocks, 
  selectedProduct,
  productId
}: UseProductBuilderParams): UseProductBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<ProductBlock | null>(null)
  const [deletedBlockIds, setDeletedBlockIds] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  // Reset selected block when product changes
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedProduct])

  // Helper function to update block content
  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return
    
    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedProduct][blockIndex] = {
        ...updatedBlocks[selectedProduct][blockIndex],
        content: {
          ...updatedBlocks[selectedProduct][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
    }
  }

  // Stage a block for deletion (doesn't delete until save)
  const handleDeleteBlock = (block: ProductBlock) => {
    // Add to staged deletions
    setDeletedBlockIds(prev => new Set(prev).add(block.id))
    
    // Clear selection if deleted block was selected
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
    
    setSaveMessage("Block marked for deletion. Click Save to apply changes.")
    setTimeout(() => setSaveMessage(""), 3000)
  }

  // Get default content for a block type
  const getDefaultContent = (blockType: string) => {
    switch (blockType) {
      case 'product-hero':
        return {
          title: 'New Hero Section',
          subtitle: 'Add your subtitle here',
          primaryButton: 'Get Started',
          secondaryButton: 'Learn More',
          primaryButtonLink: '',
          secondaryButtonLink: '',
          primaryButtonStyle: 'primary',
          secondaryButtonStyle: 'outline',
          backgroundColor: '#ffffff',
          showRainbowButton: false,
          rainbowButtonText: 'Get Access to Everything',
          rainbowButtonIcon: 'github',
          githubLink: '',
          showParticles: true,
          trustedByText: '',
          trustedByTextColor: '#6b7280',
          trustedByCount: '',
          trustedByAvatars: [
            { src: "", alt: "User 1", fallback: "U1" },
            { src: "", alt: "User 2", fallback: "U2" },
            { src: "", alt: "User 3", fallback: "U3" }
          ]
        }
      default:
        return {}
    }
  }

  // Add a new product hero block
  const handleAddProductHeroBlock = () => {
    const newBlock: ProductBlock = {
      id: `product-hero-${Date.now()}`,
      type: 'product-hero',
      title: 'Product Hero',
      content: getDefaultContent('product-hero')
    }
    
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedProduct] || []
    updatedBlocks[selectedProduct] = [...currentBlocks, newBlock]
    
    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
    
    setSaveMessage("Product hero block added!")
    setTimeout(() => setSaveMessage(""), 3000)
  }


  // Handle block reordering
  const handleReorderBlocks = (reorderedBlocks: ProductBlock[]) => {
    // Filter out any blocks that are marked for deletion
    const validReorderedBlocks = reorderedBlocks.filter(block => !deletedBlockIds.has(block.id))
    
    // Update local state immediately for responsive UX
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = validReorderedBlocks
    setBlocks(updatedBlocks)
  }

  // Save all block customizations to database
  const handleSaveAllBlocks = async () => {    
    if (!productId) {
      setSaveMessage("Error: Product ID required for saving")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedProduct] || []
    const activeBlocks = currentBlocks.filter(b => !deletedBlockIds.has(b.id))
    
    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await saveProductBlocksAction(productId, activeBlocks)
      
      if (result.success) {
        // Clear staged deletions and update local state
        if (deletedBlockIds.size > 0) {
          const updatedBlocks = { ...blocks }
          updatedBlocks[selectedProduct] = activeBlocks
          setBlocks(updatedBlocks)
          setDeletedBlockIds(new Set())
        }
        
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      } else {
        setSaveMessage(`Error: ${result.error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      }
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
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
    handleReorderBlocks,
    handleAddProductHeroBlock,
    handleSaveAllBlocks
  }
}