import { useState, useEffect } from "react"
import { updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import { getBlockTypeDefinition } from "./event-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseEventBuilderParams {
  blocks: Record<string, EventBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, EventBlock[]>>>
  selectedEvent: string
  eventId?: string
  currentEvent?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseEventBuilderReturn {
  selectedBlock: EventBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<EventBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: EventBlock) => void
  handleReorderBlocks: (blocks: EventBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useEventBuilder({
  blocks,
  setBlocks,
  selectedEvent,
  eventId,
  currentEvent
}: UseEventBuilderParams): UseEventBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<EventBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedEvent])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedEvent].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedEvent][blockIndex] = {
        ...updatedBlocks[selectedEvent][blockIndex],
        content: {
          ...updatedBlocks[selectedEvent][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedEvent][blockIndex])
    }
  }

  const handleDeleteBlock = (block: EventBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedEvent] = updatedBlocks[selectedEvent].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: EventBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedEvent] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedEvent] || []
    const newBlocks: EventBlock[] = []

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
        const newBlock: EventBlock = {
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent }
        }
        newBlocks.push(newBlock)
      }
    }

    // Add all new blocks to the end of the current blocks
    updatedBlocks[selectedEvent] = [...currentBlocks, ...newBlocks]

    setBlocks(updatedBlocks)
  }

  const handleSaveAllBlocks = async () => {
    if (!eventId) {
      setSaveMessage("Error: Event ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedEvent] || []

    // Get existing content blocks from the currentEvent to preserve settings
    const existingContentBlocks = currentEvent?.content_blocks || {}

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
      const result = await updateEventBlocksAction(eventId, contentBlocks)

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
