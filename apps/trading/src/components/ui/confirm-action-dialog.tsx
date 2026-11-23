import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The app's one confirmation dialog: a title, the consequence spelled out in
 * plain English, and a Cancel → destructive footer. Header and footer only —
 * a confirmation never has a body.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel = "Confirm",
  busy = false,
  confirmDisabled = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  /** What actually happens when the user confirms. */
  consequence: React.ReactNode
  confirmLabel?: React.ReactNode
  busy?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing (Escape, overlay, X) while the action is in flight.
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
