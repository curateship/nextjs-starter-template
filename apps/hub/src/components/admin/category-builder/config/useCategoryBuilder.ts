import { useState, useEffect } from "react"
import { updateCategoryBlockValuesAction } from "@/lib/actions/categories/category-actions"
import { categoryBlocksToValueJson } from "@/lib/actions/categories/category-template-inheritance"
import type { CategoryEditorBlock } from "./category-block-utils"

interface UseCategoryBuilderParams {
  blocks: Record<string, CategoryEditorBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, CategoryEditorBlock[]>>>
  selectedCategory: string
  categoryId?: string
}

interface UseCategoryBuilderReturn {
  selectedBlock: CategoryEditorBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<CategoryEditorBlock | null>>
  isSaving: boolean
  saveMessage: string
  handleSaveAllBlocks: () => void
}

// Value-only editing (mirrors useDirectoryBuilder): block structure lives in the
// category template; saving stores only per-category value keys on the row.
export function useCategoryBuilder({
  blocks,
  setBlocks,
  selectedCategory,
  categoryId,
}: UseCategoryBuilderParams): UseCategoryBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<CategoryEditorBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  // Clear selection when switching categories
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedCategory])

  const handleSaveAllBlocks = async () => {
    if (!categoryId) {
      setSaveMessage("Error: Category ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const contentBlocks = categoryBlocksToValueJson(blocks[selectedCategory] || [])

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateCategoryBlockValuesAction(categoryId, contentBlocks)

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
    handleSaveAllBlocks
  }
}
