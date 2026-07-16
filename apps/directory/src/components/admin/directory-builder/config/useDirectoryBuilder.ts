import { useState, useEffect } from "react"
import { updateDirectoryBlockValuesAction } from "@/lib/actions/directories/directory-actions"
import { normalizeDirectoryBlockContent } from "@/lib/actions/directories/directory-layout"
import { directoryBlocksToValueJson } from "@/lib/actions/directories/directory-template-inheritance"
import { orderDirectoryEditorBlocks, type DirectoryEditorBlock } from "./directory-block-utils"
import { hasSaveableChange, type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"

interface UseDirectoryBuilderParams {
  blocks: Record<string, DirectoryEditorBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, DirectoryEditorBlock[]>>>
  selectedDirectory: string
  directoryId?: string
}

interface UseDirectoryBuilderReturn {
  selectedBlock: DirectoryEditorBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<DirectoryEditorBlock | null>>
  isSaving: boolean
  saveStatus: SaveStatus
  handleUpdateBlock: (blockId: string, updates: Partial<DirectoryEditorBlock>) => void
  handleSaveAllBlocks: () => void
}

export function useDirectoryBuilder({
  blocks,
  setBlocks,
  selectedDirectory,
  directoryId,
}: UseDirectoryBuilderParams): UseDirectoryBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<DirectoryEditorBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedDirectory])

  const handleUpdateBlock = (blockId: string, updates: Partial<DirectoryEditorBlock>) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = [...(updatedBlocks[selectedDirectory] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === blockId)

    if (blockIndex === -1) return

    const currentBlock = currentBlocks[blockIndex]
    const nextType = updates.type || currentBlock.type
    const updatedBlock = {
      ...currentBlock,
      ...updates,
      type: nextType,
      content: normalizeDirectoryBlockContent(
        nextType,
        updates.content || currentBlock.content
      ),
    }
    const currentNormalizedBlock = {
      ...currentBlock,
      content: normalizeDirectoryBlockContent(currentBlock.type, currentBlock.content),
    }

    if (!hasSaveableChange(currentNormalizedBlock, updatedBlock)) return

    currentBlocks[blockIndex] = updatedBlock
    updatedBlocks[selectedDirectory] = currentBlocks
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
    setSaveStatus("dirty")
  }

  const handleSaveAllBlocks = async () => {
    if (!directoryId) {
      setSaveStatus("error", "Directory ID required")
      return
    }

    const currentBlocks = orderDirectoryEditorBlocks(blocks[selectedDirectory] || [])
    const contentBlocks = directoryBlocksToValueJson(currentBlocks)

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const result = await updateDirectoryBlockValuesAction(directoryId, contentBlocks)

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
    handleUpdateBlock,
    handleSaveAllBlocks
  }
}
