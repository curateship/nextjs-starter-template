"use client"

import { EventContentBlock } from "@/components/admin/event-builder/blocks/EventContentBlock"

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
  eventTitle: string
  onEventTitleChange: (title: string) => void
}

export function EventBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
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
        eventData={{ title: eventTitle }}
        onEventTitleChange={onEventTitleChange}
      />
    )
  }

  return null
}
