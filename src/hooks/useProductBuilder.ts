import { useState, useEffect } from "react"

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
  handleAddProductDetailsBlock: () => void
  handleAddProductGalleryBlock: () => void
  handleSaveAllBlocks: () => void
}

export function useProductBuilder({ 
  blocks, 
  setBlocks, 
  selectedProduct
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
          title: "New Product",
          subtitle: "Product description",
          price: "$99",
          ctaText: "Add to Cart"
        }
      case 'product-details':
        return {
          description: "Product description goes here...",
          specifications: [
            { label: "Feature 1", value: "Value 1" },
            { label: "Feature 2", value: "Value 2" }
          ]
        }
      case 'product-gallery':
        return {
          images: [],
          showThumbnails: true
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

  // Add a new product details block
  const handleAddProductDetailsBlock = () => {
    const newBlock: ProductBlock = {
      id: `product-details-${Date.now()}`,
      type: 'product-details',
      title: 'Product Details',
      content: getDefaultContent('product-details')
    }
    
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedProduct] || []
    updatedBlocks[selectedProduct] = [...currentBlocks, newBlock]
    
    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
    
    setSaveMessage("Product details block added!")
    setTimeout(() => setSaveMessage(""), 3000)
  }

  // Add a new product gallery block
  const handleAddProductGalleryBlock = () => {
    const newBlock: ProductBlock = {
      id: `product-gallery-${Date.now()}`,
      type: 'product-gallery',
      title: 'Product Gallery',
      content: getDefaultContent('product-gallery')
    }
    
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedProduct] || []
    updatedBlocks[selectedProduct] = [...currentBlocks, newBlock]
    
    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
    
    setSaveMessage("Product gallery block added!")
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

  // Save all block customizations (placeholder - no server calls yet)
  const handleSaveAllBlocks = () => {    
    const hasActiveBlocks = blocks[selectedProduct] && blocks[selectedProduct].length > 0
    const hasDeletions = deletedBlockIds.size > 0
    
    if (!hasActiveBlocks && !hasDeletions) {
      setSaveMessage("No changes to save")
      return
    }

    setIsSaving(true)
    setSaveMessage("")

    // Simulate save operation
    setTimeout(() => {
      // Clear staged deletions and update local state
      if (hasDeletions) {
        const updatedBlocks = { ...blocks }
        updatedBlocks[selectedProduct] = updatedBlocks[selectedProduct].filter(b => !deletedBlockIds.has(b.id))
        setBlocks(updatedBlocks)
        setDeletedBlockIds(new Set())
      }
      
      setSaveMessage("Saved!")
      setTimeout(() => setSaveMessage(""), 3000)
      setIsSaving(false)
    }, 1000)
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
    handleAddProductDetailsBlock,
    handleAddProductGalleryBlock,
    handleSaveAllBlocks
  }
}