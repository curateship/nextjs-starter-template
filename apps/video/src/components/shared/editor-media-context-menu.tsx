import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  deleteEditorMedia,
  getVideoMediaErrorMessage,
  type MediaScope,
} from "@/lib/api/video/media"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The shared right-click action for media cards in both editor libraries. */
export function EditorMediaContextMenu({
  scope,
  mediaId,
  mediaName,
  onDeleted,
  children,
}: {
  scope: MediaScope
  mediaId: string
  mediaName: string
  onDeleted: (mediaId: string) => void
  children: React.ReactElement
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteEditorMedia(scope, mediaId)
      setConfirming(false)
      onDeleted(mediaId)
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger asChild>
          {children}
        </ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.Content className="z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <ContextMenuPrimitive.Item
              className="relative flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-hidden select-none focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
              onSelect={() => setConfirming(true)}
            >
              <Trash2Icon />
              Delete media
            </ContextMenuPrimitive.Item>
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Root>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!deleting) setConfirming(open)
        }}
        title={`Delete ${mediaName}?`}
        description="The file will be erased from storage and will stop loading anywhere it is already used. This cannot be undone."
        confirmLabel="Delete media"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
