import * as React from "react"
import { ImagePlusIcon, ImageUpIcon, Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { SLOT_LABELS } from "@/components/fitness/photos/measurements"
import { PrivatePhoto } from "@/components/fitness/photos/private-photo"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changePhotoSession, uploadPhoto, type PhotoSession, type PhotoSlot as Slot } from "@/lib/api/fitness/photos"
import { formatDay } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * One photo slot. Its button opens the phone's camera or photo library.
 *
 * This is a plain file input on purpose, not the shell's `image-upload.tsx`:
 * that one saves into the public media library, and these photos must never
 * get a public address. They go to `uploadPhoto`, which keeps them private.
 */
export function PhotoSlot({
  session,
  slot,
  canEdit,
  onChange,
}: {
  session: PhotoSession
  slot: Slot
  canEdit: boolean
  onChange: (session: PhotoSession) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const address = session.photos[slot]
  const label = `${SLOT_LABELS[slot]}, ${formatDay(session.day)}`

  async function upload(file: File) {
    setBusy(true)
    try {
      onChange(await uploadPhoto(session.id, slot, file))
      toast.success(`${SLOT_LABELS[slot]} photo saved.`)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const saved = await changePhotoSession({ action: "removePhoto", sessionId: session.id, slot })
      if (saved) onChange(saved)
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <figure className="grid gap-1">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted/50">
        {address ? (
          <PrivatePhoto src={address} alt={label} className="size-full object-cover" />
        ) : canEdit ? (
          <button
            type="button"
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted",
              focusRing
            )}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2Icon className="size-5 animate-spin" /> : <ImagePlusIcon className="size-5" />}
            Add photo
          </button>
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">No photo</span>
        )}
        {address && canEdit ? (
          <div className="absolute top-1 right-1 flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  aria-label={`Replace the ${SLOT_LABELS[slot].toLowerCase()} photo`}
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  {busy ? <Loader2Icon className="animate-spin" /> : <ImageUpIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replace photo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  aria-label={`Remove the ${SLOT_LABELS[slot].toLowerCase()} photo`}
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <XIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove photo</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      <figcaption className="text-xs text-muted-foreground">{SLOT_LABELS[slot]}</figcaption>
      {canEdit ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Choose the ${SLOT_LABELS[slot].toLowerCase()} photo`}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      ) : null}
    </figure>
  )
}
