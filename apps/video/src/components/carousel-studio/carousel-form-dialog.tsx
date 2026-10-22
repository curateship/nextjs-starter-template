import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getCarouselErrorMessage,
  renameCarousel,
  type CarouselItem,
} from "@/lib/api/video/carousels"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** Renaming a carousel. New carousels start in `NewCarouselDialog`. */
export function CarouselFormDialog({
  open,
  carousel,
  onClose,
  onSaved,
}: {
  open: boolean
  carousel: CarouselItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState(carousel?.name ?? "")
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setName(carousel?.name ?? "")
  }

  async function handleSave() {
    if (!name.trim()) {
      showErrorToast("A carousel needs a name.")
      inputRef.current?.focus()
      return
    }
    if (!carousel) return
    setSaving(true)
    try {
      await renameCarousel(carousel.id, name)
      toast.success("Carousel renamed.")
      onSaved()
      dismissErrorToast()
      onClose()
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={name !== (carousel?.name ?? "")}
      busy={saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename carousel</DialogTitle>
            <DialogDescription>
              What this carousel is called in the list.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Name</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="carousel-name">Carousel name</Label>
                    <Input
                      id="carousel-name"
                      ref={inputRef}
                      value={name}
                      maxLength={200}
                      aria-invalid={!name.trim() || undefined}
                      placeholder="Five ways to improve your hook"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
