import { useState, useEffect } from "react"
import { updateProductBlocksAction } from "@/lib/actions/products/product-actions"
import { getBlockTypeDefinition } from "./product-block-types"
import { productBlocksToJson, type ProductBuilderBlock } from "./product-block-utils"

type ProductBlock = ProductBuilderBlock

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
  handleUpdateBlock: (blockId: string, updates: Record<string, any>) => void
  replaceSelectedBlockContent: (content: Record<string, any>) => void
  saveSelectedBlockContent: (content: Record<string, any>) => Promise<boolean>
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

  const buildContentBlocksPayload = (currentBlocks: ProductBlock[]) => {
    const existingContentBlocks = currentProduct?.content_blocks || {}
    return productBlocksToJson(currentBlocks, existingContentBlocks)
  }

  const persistBlocks = async (currentBlocks: ProductBlock[]) => {
    if (!productId) {
      setSaveMessage("Error: Product ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return false
    }

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateProductBlocksAction(productId, buildContentBlocksPayload(currentBlocks))

      if (result.success) {
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
        return true
      }

      setSaveMessage(`Error: ${result.error}`)
      setTimeout(() => setSaveMessage(""), 5000)
      return false
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedProduct])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const currentBlocks = [...(blocks[selectedProduct] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      const updatedBlock = {
        ...currentBlocks[blockIndex],
        content: {
          ...currentBlocks[blockIndex].content,
          [field]: value
        }
      }
      currentBlocks[blockIndex] = updatedBlock
      const updatedBlocks = {
        ...blocks,
        [selectedProduct]: currentBlocks,
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlock)
    }
  }

  const handleUpdateBlock = (blockId: string, updates: Record<string, any>) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = [...(updatedBlocks[selectedProduct] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === blockId)

    if (blockIndex === -1) return

    const updatedBlock = {
      ...currentBlocks[blockIndex],
      ...updates,
      content: updates.content !== undefined ? updates.content : currentBlocks[blockIndex].content,
    }

    currentBlocks[blockIndex] = updatedBlock
    updatedBlocks[selectedProduct] = currentBlocks
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
  }

  const replaceSelectedBlockContent = (content: Record<string, any>) => {
    if (!selectedBlock) return

    const currentBlocks = [...(blocks[selectedProduct] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      const updatedBlock = {
        ...currentBlocks[blockIndex],
        content,
      }
      currentBlocks[blockIndex] = updatedBlock
      const updatedBlocks = {
        ...blocks,
        [selectedProduct]: currentBlocks,
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlock)
    }
  }

  const saveSelectedBlockContent = async (content: Record<string, any>) => {
    if (!selectedBlock) return false

    const currentBlocks = [...(blocks[selectedProduct] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === selectedBlock.id)

    if (blockIndex === -1) {
      return false
    }

    const updatedBlock = {
      ...currentBlocks[blockIndex],
      content,
    }
    currentBlocks[blockIndex] = updatedBlock

    const updatedBlocks = {
      ...blocks,
      [selectedProduct]: currentBlocks,
    }
    setBlocks(updatedBlocks)
    setSelectedBlock(updatedBlock)

    return persistBlocks(currentBlocks)
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
    updatedBlocks[selectedProduct] = reorderedBlocks.map((block, index) => ({
      ...block,
      display_order: index,
    }))
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
  }

  const handleSaveAllBlocks = async () => {
    await persistBlocks(blocks[selectedProduct] || [])
  }

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    updateBlockContent,
    handleUpdateBlock,
    replaceSelectedBlockContent,
    saveSelectedBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
