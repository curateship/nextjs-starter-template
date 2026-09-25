"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent, DashboardModalFormFooter } from "@/components/admin/layout/dashboard/modals"
import { EventBlockEditor, type EventBlockEditorMode } from "./EventBlockEditor"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface EventBlockEditorModalProps {
  block: EventBlock | null
  content: Record<string, any>
  siteId: string
  mode?: EventBlockEditorMode
  eventTitle?: string
  onEventTitleChange?: (title: string) => void
  onContentChange: (field: string, value: any) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
}

export function EventBlockEditorModal({
  block,
  content,
  siteId,
  mode = "instance",
  eventTitle = "",
  onEventTitleChange,
  onContentChange,
  onClose,
  onSave,
  saving = false,
}: EventBlockEditorModalProps) {
  if (!block) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalTabsProvider>
        <DashboardModalContent
          busy={saving}
          title={`${mode === "template" ? "Configure" : "Edit"} ${block.title}`}
          titleAccessory={<ModalTabs />}
          footer={<DashboardModalFormFooter busy={saving} cancelDisabled={saving} form="event-block-editor-form" onCancel={onClose} submitLabel="Save" />}
        >
          <form
            noValidate
            id="event-block-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              onSave()
            }}
          >
          <EventBlockEditor
            block={block}
            content={content}
            onContentChange={onContentChange}
            siteId={siteId}
            mode={mode}
            eventTitle={eventTitle}
            onEventTitleChange={onEventTitleChange}
          />
          </form>
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
