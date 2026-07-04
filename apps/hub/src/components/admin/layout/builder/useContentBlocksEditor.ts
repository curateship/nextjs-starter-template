import { useState, useEffect } from "react"
import type { BlockTypeDefinition } from "@/lib/utils/block-types"
import { hasSaveableChange, type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"

/**
 * Generic block-editing hook for builders that keep their editor state as
 * Record<contentSlug, Block[]> (events, categories, account pages, pages,
 * directories, products). Owns block selection, add/delete/reorder over the
 * selected slug's array, and the save flow that converts the array back to the
 * persisted JSON shape while preserving non-block settings keys
 * (e.g. show_featured_image and _settings.*).
 *
 * Per-builder wrappers supply the block-type registry, the save server action,
 * and any builder-specific block factory, keeping their existing hook names
 * and return shapes.
 */

export interface BuilderBlockSelection {
  type: string
  quantity: number
}

interface EditorBlock {
  id: string
  type: string
  content: Record<string, any>
}

interface UseContentBlocksEditorParams<B extends EditorBlock> {
  blocks: Record<string, B[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, B[]>>>
  /** The selected content slug — block selection clears when it changes */
  selectedKey: string
  /** The content row ID the save action writes to */
  contentId?: string
  /** The persisted content_blocks of the current row — non-block settings are preserved on save */
  existingContentBlocks?: Record<string, any>
  /** Block-type registry lookup for the builder */
  getDefinition: (type: string) => BlockTypeDefinition | undefined
  /** Build a new block from its definition (per-builder id format / extra fields) */
  makeBlock: (type: string, definition: BlockTypeDefinition, index: number) => B
  /** Persist the converted content_blocks JSON */
  saveAction: (contentId: string, contentBlocks: Record<string, any>) => Promise<{ success: boolean; error?: string | null }>
  /** Error detail shown when saving without a content row ID, e.g. "Event ID required" */
  missingIdMessage: string
}

export interface UseContentBlocksEditorReturn<B extends EditorBlock> {
  selectedBlock: B | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<B | null>>
  isSaving: boolean
  saveStatus: SaveStatus
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: B) => void
  handleReorderBlocks: (blocks: B[]) => void
  handleAddBlocks: (selections: BuilderBlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useContentBlocksEditor<B extends EditorBlock>({
  blocks,
  setBlocks,
  selectedKey,
  contentId,
  existingContentBlocks,
  getDefinition,
  makeBlock,
  saveAction,
  missingIdMessage,
}: UseContentBlocksEditorParams<B>): UseContentBlocksEditorReturn<B> {
  const [selectedBlock, setSelectedBlock] = useState<B | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  // Clear the selection when switching to a different content item
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedKey])

  // Update one content field of the currently selected block
  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedKey].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      if (!hasSaveableChange(updatedBlocks[selectedKey][blockIndex].content?.[field], value)) return

      updatedBlocks[selectedKey][blockIndex] = {
        ...updatedBlocks[selectedKey][blockIndex],
        content: {
          ...updatedBlocks[selectedKey][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedKey][blockIndex])
      setSaveStatus("dirty")
    }
  }

  const handleDeleteBlock = (block: B) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedKey] = updatedBlocks[selectedKey].filter(b => b.id !== block.id)
    if (!hasSaveableChange(blocks[selectedKey], updatedBlocks[selectedKey])) return

    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
    setSaveStatus("dirty")
  }

  const handleReorderBlocks = (reorderedBlocks: B[]) => {
    if (!hasSaveableChange(blocks[selectedKey] || [], reorderedBlocks)) return

    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedKey] = reorderedBlocks
    setBlocks(updatedBlocks)
    setSaveStatus("dirty")
  }

  const handleAddBlocks = (selections: BuilderBlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedKey] || []
    const newBlocks: B[] = []

    for (const selection of selections) {
      const blockDefinition = getDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      for (let i = 0; i < selection.quantity; i++) {
        newBlocks.push(makeBlock(selection.type, blockDefinition, i))
      }
    }

    if (newBlocks.length === 0) {
      return
    }

    updatedBlocks[selectedKey] = [...currentBlocks, ...newBlocks]
    setBlocks(updatedBlocks)
    setSaveStatus("dirty")
  }

  const handleSaveAllBlocks = async () => {
    if (!contentId) {
      setSaveStatus("error", missingIdMessage)
      return
    }

    const currentBlocks = blocks[selectedKey] || []

    // Preserve non-block settings (e.g. show_featured_image, _settings)
    const preservedSettings: Record<string, any> = {}
    Object.entries(existingContentBlocks || {}).forEach(([key, value]) => {
      if (typeof value !== 'object' || value === null) {
        preservedSettings[key] = value
      } else if (key.startsWith('_')) {
        preservedSettings[key] = value
      }
    })

    // Convert the block array back to the persisted JSON object keyed by block ID
    const newContentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      newContentBlocks[block.id] = {
        id: block.id,
        type: block.type,
        content: block.content,
        display_order: index
      }
    })

    const contentBlocks: Record<string, any> = {
      ...preservedSettings,
      ...newContentBlocks
    }

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const result = await saveAction(contentId, contentBlocks)

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

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveStatus,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
