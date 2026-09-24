import * as React from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog } from "@/components/ui/dialog"

/**
 * The Dialog to use for a window that holds typed work.
 *
 * It is a plain Dialog until something has been edited. After that, every way
 * out — the backdrop (an explicit close target here, see dialog.tsx), Escape,
 * the X, and the footer's Cancel — asks before throwing the edits away, so one
 * stray click outside a half-filled window cannot silently empty it. A clean
 * window still closes instantly.
 *
 * `busy` is a save in flight: it refuses every close path outright rather than
 * asking, the same rule ConfirmDialog follows while its action runs.
 *
 * Cancel buttons live inside `children`, which is why children is a function —
 * it is handed the one close request every exit route goes through.
 */
export function FormDialog({
  open,
  dirty,
  busy = false,
  onClose,
  children,
}: {
  open: boolean
  /** True once the form holds edits that closing would throw away. */
  dirty: boolean
  /** True while a save is running, which blocks closing entirely. */
  busy?: boolean
  onClose: () => void
  children: (requestClose: () => void) => React.ReactNode
}) {
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false)

  const requestClose = React.useCallback(() => {
    if (busy) return
    if (dirty) {
      setConfirmingDiscard(true)
      return
    }
    onClose()
  }, [busy, dirty, onClose])

  // A window that opens or closes on its own (a save landed, the row it was
  // editing went away) takes any question about its edits with it, rather than
  // leaving one standing to greet whatever opens next.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (confirmingDiscard) setConfirmingDiscard(false)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose()
        }}
      >
        {children(requestClose)}
      </Dialog>
      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard changes?"
        description="This window has edits that have not been saved. Closing it now throws them away."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmingDiscard(false)
          onClose()
        }}
      />
    </>
  )
}
