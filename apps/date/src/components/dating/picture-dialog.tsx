import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { DatingPicture } from "./picture"

/** One picture full size: a card's photo, or a step's screenshot. Read-only, so it ends with Done. */
export function PictureDialog({
  picture,
  onClose,
}: {
  picture: { id: string; title: string; description?: string } | null
  onClose: () => void
}) {
  return (
    <Dialog open={picture !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{picture?.title}</DialogTitle>
          {picture?.description ? <DialogDescription>{picture.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          {picture ? <DatingPicture pictureId={picture.id} alt={picture.title} fit="contain" className="max-h-[70vh] w-full rounded-md" /> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
