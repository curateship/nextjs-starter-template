import { useState, useEffect, useRef } from "react"
import { updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import { eventBlocksToValueJson } from "@/lib/actions/events/event-template-inheritance"
import type { EventEditorBlock } from "./event-block-utils"
import { type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"

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
      const result = await updateEventBlocksAction({ data: { eventId: eventId, contentBlocks: contentBlocks } })

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
