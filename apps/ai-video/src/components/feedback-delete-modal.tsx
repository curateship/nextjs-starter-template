import { Loader2Icon, Trash2Icon } from "lucide-react"

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
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">{body}</p>
        </DialogBody>
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
            {deleting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2Icon className="h-4 w-4" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
