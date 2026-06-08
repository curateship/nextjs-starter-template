import { useState, useEffect } from "react"
import { updateDirectoryBlockValuesAction } from "@/lib/actions/directories/directory-actions"
import { normalizeDirectoryBlockContent } from "@/lib/actions/directories/directory-layout"
import { directoryBlocksToValueJson } from "@/lib/actions/directories/directory-template-inheritance"
import { orderDirectoryEditorBlocks, type DirectoryEditorBlock } from "./directory-block-utils"

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
  saveMessage: string
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
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedDirectory])

  const handleUpdateBlock = (blockId: string, updates: Partial<DirectoryEditorBlock>) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = [...(updatedBlocks[selectedDirectory] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === blockId)

    if (blockIndex === -1) return

    const nextType = updates.type || currentBlocks[blockIndex].type
    const updatedBlock = {
      ...currentBlocks[blockIndex],
      ...updates,
      type: nextType,
      content: normalizeDirectoryBlockContent(
        nextType,
        updates.content || currentBlocks[blockIndex].content
      ),
    }

    currentBlocks[blockIndex] = updatedBlock
    updatedBlocks[selectedDirectory] = currentBlocks
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
  }

  const handleSaveAllBlocks = async () => {
    if (!directoryId) {
      setSaveMessage("Error: Directory ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = orderDirectoryEditorBlocks(blocks[selectedDirectory] || [])
    const contentBlocks = directoryBlocksToValueJson(currentBlocks)

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateDirectoryBlockValuesAction(directoryId, contentBlocks)

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
    handleUpdateBlock,
    handleSaveAllBlocks
  }
}
