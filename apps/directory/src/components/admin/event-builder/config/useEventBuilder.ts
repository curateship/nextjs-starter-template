import { useState, useEffect } from "react"
import { updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import { eventBlocksToValueJson } from "@/lib/actions/events/event-template-inheritance"
import type { EventEditorBlock } from "./event-block-utils"
import { type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"

interface UseEventBuilderParams {
  blocks: Record<string, EventEditorBlock[]>
  selectedEvent: string
  eventId?: string
}

interface UseEventBuilderReturn {
  selectedBlock: EventEditorBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<EventEditorBlock | null>>
  isSaving: boolean
  saveStatus: SaveStatus
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
  const [saveStatus, setSaveStatus] = useSaveStatus()

  // Clear selection when switching events
  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedEvent])

  const handleSaveAllBlocks = async () => {
    if (!eventId) {
      setSaveStatus("error", "Event ID required")
      return
    }

    const contentBlocks = eventBlocksToValueJson(blocks[selectedEvent] || [])

    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const result = await updateEventBlocksAction(eventId, contentBlocks)

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
    handleSaveAllBlocks
  }
}
