import { useState, useEffect, useRef } from "react"
import { updateCategoryBlockValuesAction } from "@/lib/actions/categories/category-actions"
import { categoryBlocksToValueJson } from "@/lib/actions/categories/category-template-inheritance"
import type { CategoryEditorBlock } from "./category-block-utils"
import { type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"

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
  saveStatus: SaveStatus
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
  const [saveStatus, setSaveStatus] = useSaveStatus()

  // Clear selection when switching categories
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedCategory])

  const handleSaveAllBlocks = async () => {
    if (!categoryId) {
      setSaveStatus("error", "Category ID required")
      return
    }

    const contentBlocks = categoryBlocksToValueJson(blocks[selectedCategory] || [])

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const result = await updateCategoryBlockValuesAction({ data: { categoryId: categoryId, contentBlocks: contentBlocks } })

      if (result.success) {
        setSaveStatus("saved")
      } else {
        setSaveStatus("error", result.error || "Failed to save")
      }
    } catch (error) {
      setSaveStatus("error", error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
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
    handleSaveAllBlocks
  }
}
