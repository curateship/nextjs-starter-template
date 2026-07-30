import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// The one confirmation dialog for destructive actions: admin chrome, the
// consequence in the description, Cancel then a destructive confirm. While
// `loading` the action is running — both buttons disable, the confirm shows a
// spinner, and every close path (X, overlay, Escape) is blocked so the action
// cannot be re-fired or abandoned mid-flight. `children` is for the rare
// confirmation that needs an input (e.g. delete account's password check) and
// renders as a standard DialogBody.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  loading = false,
  disabled = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  destructive?: boolean
  loading?: boolean
  disabled?: boolean
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return
        onOpenChange(next)
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* The consequence sentence is the modal's content, not part of the
            header — DialogDescription keeps the accessible wiring wherever it
            renders. */}
        <DialogBody>
          <DialogDescription>{description}</DialogDescription>
          {children}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={loading || disabled}
            onClick={onConfirm}
          >
            {loading ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
