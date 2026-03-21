import { useState, useEffect } from "react"
import { updateProductBlocksAction } from "@/lib/actions/products/product-actions"
import { getBlockTypeDefinition } from "./product-block-types"

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
  productId?: string
  currentProduct?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface BlockSelection {
  type: string
  quantity: number
}

interface UseProductBuilderReturn {
  selectedBlock: ProductBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<ProductBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: ProductBlock) => void
  handleReorderBlocks: (blocks: ProductBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useProductBuilder({ 
  blocks, 
  setBlocks, 
  selectedProduct,
  productId,
  currentProduct
}: UseProductBuilderParams): UseProductBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<ProductBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedProduct])

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

  const handleDeleteBlock = (block: ProductBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = updatedBlocks[selectedProduct].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)
    
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: ProductBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedProduct] || []
    const newBlocks: ProductBlock[] = []

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
        const newBlock: ProductBlock = {
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent }
        }
        newBlocks.push(newBlock)
      }
    }

    // Add all new blocks to the end of the current blocks
    updatedBlocks[selectedProduct] = [...currentBlocks, ...newBlocks]

    setBlocks(updatedBlocks)

    // Select the last added block
    if (newBlocks.length > 0) {
      setSelectedBlock(newBlocks[newBlocks.length - 1])
    }
  }

  const handleSaveAllBlocks = async () => {
    if (!productId) {
      setSaveMessage("Error: Product ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedProduct] || []
    
    // Get existing content blocks from the currentProduct to preserve settings
    const existingContentBlocks = currentProduct?.content_blocks || {}
    
    // Convert blocks array to JSON object format keyed by block ID
    const newContentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      newContentBlocks[block.id] = {
        id: block.id,
        type: block.type,
        content: block.content,
        display_order: index
      }
    })

    // Preserve existing _settings and merge with new blocks
    const contentBlocks: Record<string, any> = {
      ...newContentBlocks,
      ...(existingContentBlocks._settings && {
        _settings: existingContentBlocks._settings
      })
    }
    
    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateProductBlocksAction(productId, contentBlocks)
      
      if (result.success) {
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
    isSaving,
    saveMessage,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}