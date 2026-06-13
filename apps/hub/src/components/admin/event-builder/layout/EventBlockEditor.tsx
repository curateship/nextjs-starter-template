"use client"

import { EventContentBlock } from "@/components/admin/event-builder/blocks/EventContentBlock"

export type EventBlockEditorMode = "instance" | "template"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface EventBlockEditorProps {
  block: EventBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  mode?: EventBlockEditorMode
  eventTitle?: string
  onEventTitleChange?: (title: string) => void
}

// Routes a selected block to its editor. Template mode edits block config
// (style/styling/visibility); instance mode edits per-event values (title + body).
export function EventBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  mode = "instance",
  eventTitle,
  onEventTitleChange,
}: EventBlockEditorProps) {
  if (block.type === "event-content") {
    return (
      <EventContentBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
        mode={mode}
        eventData={{ title: eventTitle }}
        onEventTitleChange={onEventTitleChange}
      />
    )
  }

  return null
}
