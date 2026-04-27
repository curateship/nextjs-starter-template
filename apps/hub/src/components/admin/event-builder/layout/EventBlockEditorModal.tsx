"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import {
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalScrollBody,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { EventBlockEditor } from "./EventBlockEditor"

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
  eventTitle: string
  onEventTitleChange: (title: string) => void
  onContentChange: (field: string, value: any) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
  error?: string | null
}

export function EventBlockEditorModal({
  block,
  content,
  siteId,
  eventTitle,
  onEventTitleChange,
  onContentChange,
  onClose,
  onSave,
  saving = false,
  error,
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
        <AdminModalContent size="wide">
          <AdminModalHeader>
            <div className="flex min-w-0 items-center gap-4 pr-10">
              <AdminModalTitle className="shrink-0">Edit {block.title}</AdminModalTitle>
              <ModalTabs />
            </div>
          </AdminModalHeader>

          <AdminModalScrollBody>
              <EventBlockEditor
                block={block}
                content={content}
                onContentChange={onContentChange}
                siteId={siteId}
                eventTitle={eventTitle}
                onEventTitleChange={onEventTitleChange}
              />
          </AdminModalScrollBody>

          <AdminModalFooter className="sm:justify-between">
            {error ? <p className="text-sm text-red-600">{error}</p> : <div />}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={onSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </AdminModalFooter>
        </AdminModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
