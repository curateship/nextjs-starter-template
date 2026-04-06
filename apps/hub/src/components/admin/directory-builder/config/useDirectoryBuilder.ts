import { useState, useEffect } from "react"
import { updateDirectoryBlocksAction } from "@/lib/actions/directories/directory-actions"
import { getBlockTypeDefinition } from "./directory-block-types"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { parseDirectoryCustomBlockSelectionType } from "@/lib/actions/directories/directory-custom-blocks/utils"
import { directoryBlocksToJson, type DirectoryEditorBlock } from "./directory-block-utils"

interface BlockSelection {
  type: string
  quantity: number
}

interface UseDirectoryBuilderParams {
  blocks: Record<string, DirectoryEditorBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, DirectoryEditorBlock[]>>>
  selectedDirectory: string
  directoryId?: string
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  currentDirectory?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseDirectoryBuilderReturn {
  selectedBlock: DirectoryEditorBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<DirectoryEditorBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: DirectoryEditorBlock) => void
  handleReorderBlocks: (blocks: DirectoryEditorBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useDirectoryBuilder({
  blocks,
  setBlocks,
  selectedDirectory,
  directoryId,
  customBlockTemplates,
  currentDirectory
}: UseDirectoryBuilderParams): UseDirectoryBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<DirectoryEditorBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedDirectory])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedDirectory].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedDirectory][blockIndex] = {
        ...updatedBlocks[selectedDirectory][blockIndex],
        content: {
          ...updatedBlocks[selectedDirectory][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedDirectory][blockIndex])
    }
  }

  const handleDeleteBlock = (block: DirectoryEditorBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedDirectory] = updatedBlocks[selectedDirectory].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: DirectoryEditorBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedDirectory] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedDirectory] || []
    const newBlocks: DirectoryEditorBlock[] = []

    // Process each selection
    for (const selection of selections) {
      const customTemplateId = parseDirectoryCustomBlockSelectionType(selection.type)

      if (customTemplateId) {
        const template = customBlockTemplates.find(item => item.id === customTemplateId)

        if (!template) {
          console.warn(`Unknown custom block template: ${customTemplateId}`)
          continue
        }

        for (let i = 0; i < selection.quantity; i++) {
          const timestamp = Date.now() + i
          newBlocks.push({
            id: `directory-custom-${timestamp}`,
            type: 'directory-custom',
            title: template.name,
            content: {
              templateId: template.id,
              values: {},
            },
          })
        }

        continue
      }

      const blockDefinition = getBlockTypeDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      // Create the specified quantity of blocks
      for (let i = 0; i < selection.quantity; i++) {
        const timestamp = Date.now() + i // Ensure unique IDs
        const newBlock: DirectoryEditorBlock = {
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent }
        }
        newBlocks.push(newBlock)
      }
    }

    // Add all new blocks to the end of the current blocks
    updatedBlocks[selectedDirectory] = [...currentBlocks, ...newBlocks]

    setBlocks(updatedBlocks)

    // Select the last added block
    if (newBlocks.length > 0) {
      setSelectedBlock(newBlocks[newBlocks.length - 1])
    }
  }

  const handleSaveAllBlocks = async () => {
    if (!directoryId) {
      setSaveMessage("Error: Directory ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedDirectory] || []
    const contentBlocks = directoryBlocksToJson(currentBlocks, currentDirectory?.content_blocks || {})

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateDirectoryBlocksAction(directoryId, contentBlocks)

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
