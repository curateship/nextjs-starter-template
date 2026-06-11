import { updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import { getBlockTypeDefinition } from "./event-block-types"
import {
  useContentBlocksEditor,
  type BuilderBlockSelection,
} from "@/components/admin/layout/builder/useContentBlocksEditor"

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
  handleAddBlocks: (selections: BuilderBlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

// Thin wrapper over the shared slug-keyed blocks editor; supplies the event
// block registry, id format, and save action.
export function useEventBuilder({
  blocks,
  setBlocks,
  selectedEvent,
  eventId,
  currentEvent
}: UseEventBuilderParams): UseEventBuilderReturn {
  return useContentBlocksEditor<EventBlock>({
    blocks,
    setBlocks,
    selectedKey: selectedEvent,
    contentId: eventId,
    existingContentBlocks: currentEvent?.content_blocks,
    getDefinition: getBlockTypeDefinition,
    makeBlock: (type, definition, i) => ({
      id: `${type}-${Date.now() + i}`,
      type,
      title: definition.name,
      content: { ...definition.defaultContent }
    }),
    saveAction: updateEventBlocksAction,
    missingIdMessage: "Error: Event ID required",
  })
}
