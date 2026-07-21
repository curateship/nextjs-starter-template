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

// Delete confirm shared by the Feedback and Comments dashboards, covering
// both the single-item and mass-delete flows — the host supplies the wording.
export function FeedbackDeleteModal({
  title,
  body,
  deleting,
  confirmDisabled,
  open,
  onOpenChange,
  onConfirm,
}: {
  title: string
  body: string
  deleting: boolean
  confirmDisabled?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {body} This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting || confirmDisabled}
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {deleting ? "Deleting" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
