import { useState, useEffect } from "react"
import { updateDirectoryBlocksAction } from "@/lib/actions/directories/directory-actions"

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
  handleAddDirectoryDefaultBlock: () => void
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

  const addBlock = (type: string, title: string, defaultContent: Record<string, any>) => {
    const newBlock: DirectoryBlock = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      content: defaultContent
    }

    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedDirectory] || []
    updatedBlocks[selectedDirectory] = [...currentBlocks, newBlock]

    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
  }

  const handleAddDirectoryDefaultBlock = () => {
    addBlock('directory-default', 'Directory Information', {
      viewOnly: true
    })
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

    // Convert blocks array to JSON object format
    const newContentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      newContentBlocks[block.type] = {
        ...block.content,
        display_order: index
      }
    })

    // Preserve existing _settings and merge with new blocks
    const contentBlocks: Record<string, any> = {
      ...newContentBlocks,
      // Preserve _settings if it exists (including privacy setting)
      ...(existingContentBlocks._settings && {
        _settings: existingContentBlocks._settings
      })
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
    handleAddDirectoryDefaultBlock,
    handleSaveAllBlocks
  }
}
