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

// Confirm dialog for the dashboards' single/bulk delete flow. Pairs with
// useBulkDelete: `ids` is its deleteIds and the dialog is open while non-null.
// `noun` is the capitalized singular for the title ("Actor" → "Delete 3
// Actors?"); `description` renders the body sentence for the pending count.
export function DeleteConfirmDialog({
  ids,
  noun,
  description,
  deleting,
  onClose,
  onConfirm,
}: {
  ids: string[] | null
  noun: string
  description: (count: number) => React.ReactNode
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const count = ids?.length ?? 0
  return (
    <Dialog open={!!ids} onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Delete {count === 1 ? noun : `${count} ${noun}s`}?
          </DialogTitle>
          <DialogDescription>{description(count)}</DialogDescription>
        </DialogHeader>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {deleting ? "Deleting" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
