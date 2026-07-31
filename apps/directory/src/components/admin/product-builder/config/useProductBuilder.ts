import { useState, useEffect, useRef } from "react"
import { updateProductBlocksAction } from "@/lib/actions/products/product-actions"
import { getBlockTypeDefinition } from "./product-block-types"
import { productBlocksToJson, type ProductBuilderBlock } from "./product-block-utils"
import { hasSaveableChange, type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"

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
  saveStatus: SaveStatus
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
  const [saveStatus, setSaveStatus] = useSaveStatus()

  const buildContentBlocksPayload = (currentBlocks: ProductBlock[]) => {
    const existingContentBlocks = currentProduct?.content_blocks || {}
    return productBlocksToJson(currentBlocks, existingContentBlocks)
  }

  const persistBlocks = async (currentBlocks: ProductBlock[]) => {
    if (!productId) {
      setSaveStatus("error", "Product ID required")
      return false
    }

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const result = await updateProductBlocksAction({ data: { productId: productId, contentBlocks: buildContentBlocksPayload(currentBlocks) } })

      if (result.success) {
        setSaveStatus("saved")
        return true
      }

      setSaveStatus("error", result.error || "Failed to save")
      return false
    } catch (error) {
      setSaveStatus("error", error instanceof Error ? error.message : 'Failed to save')
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
      if (!hasSaveableChange(currentBlocks[blockIndex].content?.[field], value)) return

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
      setSaveStatus("dirty")
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
    if (!hasSaveableChange(currentBlocks[blockIndex], updatedBlock)) return

    currentBlocks[blockIndex] = updatedBlock
    updatedBlocks[selectedProduct] = currentBlocks
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
    setSaveStatus("dirty")
  }

  const replaceSelectedBlockContent = (content: Record<string, any>) => {
    if (!selectedBlock) return

    const currentBlocks = [...(blocks[selectedProduct] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      if (!hasSaveableChange(currentBlocks[blockIndex].content, content)) return

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
      setSaveStatus("dirty")
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
    if (!hasSaveableChange(blocks[selectedProduct], updatedBlocks[selectedProduct])) return

    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
    setSaveStatus("dirty")
  }

  const handleReorderBlocks = (reorderedBlocks: ProductBlock[]) => {
    const currentOrder = (blocks[selectedProduct] || []).map((block) => block.id)
    const nextOrder = reorderedBlocks.map((block) => block.id)
    if (!hasSaveableChange(currentOrder, nextOrder)) return

    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = reorderedBlocks.map((block, index) => ({
      ...block,
      display_order: index,
    }))
    setBlocks(updatedBlocks)
    setSaveStatus("dirty")
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
    if (newBlocks.length === 0) {
      return
    }

    updatedBlocks[selectedProduct] = [...currentBlocks, ...newBlocks]

    setBlocks(updatedBlocks)
    setSaveStatus("dirty")
  }

  const handleSaveAllBlocks = async () => {
    await persistBlocks(blocks[selectedProduct] || [])
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
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveStatus,
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
