import { useState, useEffect } from "react"
import { updateCategoryBlocksAction } from "@/lib/actions/categories/category-actions"
import { getBlockTypeDefinition } from "@/config/category-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseCategoryBuilderParams {
  blocks: Record<string, CategoryBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, CategoryBlock[]>>>
  selectedCategory: string
  categoryId?: string
  currentCategory?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseCategoryBuilderReturn {
  selectedBlock: CategoryBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<CategoryBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: CategoryBlock) => void
  handleReorderBlocks: (blocks: CategoryBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useCategoryBuilder({
  blocks,
  setBlocks,
  selectedCategory,
  categoryId,
  currentCategory
}: UseCategoryBuilderParams): UseCategoryBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<CategoryBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedCategory])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedCategory].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedCategory][blockIndex] = {
        ...updatedBlocks[selectedCategory][blockIndex],
        content: {
          ...updatedBlocks[selectedCategory][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedCategory][blockIndex])
    }
  }

  const handleDeleteBlock = (block: CategoryBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedCategory] = updatedBlocks[selectedCategory].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: CategoryBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedCategory] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedCategory] || []
    const newBlocksToAdd: CategoryBlock[] = []

    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      for (let i = 0; i < selection.quantity; i++) {
        const newBlock: CategoryBlock = {
          id: `block-${Date.now()}-${Math.random()}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent }
        }
        newBlocksToAdd.push(newBlock)
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    const newBlocks = [...currentBlocks, ...newBlocksToAdd]
    updatedBlocks[selectedCategory] = newBlocks
    setBlocks(updatedBlocks)

    if (newBlocksToAdd.length > 0) {
      setSelectedBlock(newBlocksToAdd[newBlocksToAdd.length - 1])
    }
  }

  const handleSaveAllBlocks = async () => {
    if (!categoryId) {
      setSaveMessage("Error: Category ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedCategory] || []

    const existingContentBlocks = currentCategory?.content_blocks || {}

    const newContentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      newContentBlocks[block.type] = {
        ...block.content,
        display_order: index
      }
    })

    const contentBlocks: Record<string, any> = {
      ...newContentBlocks,
      ...(existingContentBlocks._settings && {
        _settings: existingContentBlocks._settings
      })
    }

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateCategoryBlocksAction(categoryId, contentBlocks)

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
