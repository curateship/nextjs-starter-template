import { useState, useEffect } from "react"
import { updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import { eventBlocksToValueJson } from "@/lib/actions/events/event-template-inheritance"
import type { EventEditorBlock } from "./event-block-utils"

interface UseEventBuilderParams {
  blocks: Record<string, EventEditorBlock[]>
  selectedEvent: string
  eventId?: string
}

interface UseEventBuilderReturn {
  selectedBlock: EventEditorBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<EventEditorBlock | null>>
  isSaving: boolean
  saveMessage: string
  handleSaveAllBlocks: () => void
}

// Value-only editing (mirrors useCategoryBuilder): block structure lives in the
// event template; saving stores only per-event value keys on the row.
export function useEventBuilder({
  blocks,
  selectedEvent,
  eventId,
}: UseEventBuilderParams): UseEventBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<EventEditorBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  // Clear selection when switching events
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedEvent])

  const handleSaveAllBlocks = async () => {
    if (!eventId) {
      setSaveMessage("Error: Event ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const contentBlocks = eventBlocksToValueJson(blocks[selectedEvent] || [])

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
    handleSaveAllBlocks
  }
}
