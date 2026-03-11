import { useState, useEffect } from "react"
import { updateDirectoryBlocksAction } from "@/lib/actions/directories/directory-actions"
import { getBlockTypeDefinition } from "./directory-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseDirectoryBuilderParams {
  blocks: Record<string, DirectoryBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, DirectoryBlock[]>>>
  selectedDirectory: string
  directoryId?: string
  currentDirectory?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseDirectoryBuilderReturn {
  selectedBlock: DirectoryBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<DirectoryBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: DirectoryBlock) => void
  handleReorderBlocks: (blocks: DirectoryBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useDirectoryBuilder({
  blocks,
  setBlocks,
  selectedDirectory,
  directoryId,
  currentDirectory
}: UseDirectoryBuilderParams): UseDirectoryBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<DirectoryBlock | null>(null)
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

  const handleDeleteBlock = (block: DirectoryBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedDirectory] = updatedBlocks[selectedDirectory].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: DirectoryBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedDirectory] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedDirectory] || []
    const newBlocks: DirectoryBlock[] = []

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
        const newBlock: DirectoryBlock = {
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

    // Get existing content blocks from the currentDirectory to preserve settings
    const existingContentBlocks = currentDirectory?.content_blocks || {}

    // Preserve non-block settings (e.g. show_featured_image, _settings)
    const preservedSettings: Record<string, any> = {}
    Object.entries(existingContentBlocks).forEach(([key, value]) => {
      if (typeof value !== 'object' || value === null) {
        preservedSettings[key] = value
      } else if (key.startsWith('_')) {
        preservedSettings[key] = value
      }
    })

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

    // Merge preserved settings with new blocks
    const contentBlocks: Record<string, any> = {
      ...preservedSettings,
      ...newContentBlocks
    }

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
