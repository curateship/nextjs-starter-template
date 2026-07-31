"use client"

import { Button } from "@/components/ui/button"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
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
          className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
          footer={
            <>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button form="event-block-editor-form" type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
            </>
          }
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
