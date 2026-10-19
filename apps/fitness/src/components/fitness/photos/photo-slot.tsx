import * as React from "react"
import { ImageIcon, ImageUpIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"
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
  size = "small",
  onChange,
}: {
  session: PhotoSession
  slot: Slot
  canEdit: boolean
  /**
   * `large` is the middle panel's: the slot's name inside the box with "or
   * browse files", and a file can be dropped on it. `small` is the right
   * panel's: "Add" inside and the name under it. Both as Tyler drew them on
   * 18 Oct 2026.
   */
  size?: "large" | "small"
  onChange: (session: PhotoSession) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
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

  const large = size === "large"

  return (
    <figure className="grid gap-1.5">
      <div
        className={cn(
          "relative aspect-[3/4] overflow-hidden rounded-lg",
          address ? "border" : "border border-dashed border-muted-foreground/40 bg-background",
          dragging && "border-foreground bg-muted"
        )}
        onDragOver={(event) => {
          if (!canEdit || !large) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          // Moving over the icon or the words inside the box is not leaving it.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          if (!canEdit || !large) return
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files?.[0]
          if (file) void upload(file)
        }}
      >
        {address ? (
          <PrivatePhoto src={address} alt={label} className="size-full object-cover" />
        ) : canEdit ? (
          <button
            type="button"
            aria-label={`Add the ${SLOT_LABELS[slot].toLowerCase()} photo`}
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-muted/60",
              focusRing
            )}
            // Left to reach the photo day's card, so adding a photo in the
            // middle panel also opens that day on the right.
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : large ? (
              <>
                <ImageIcon className="mb-2 size-7 stroke-[1.5]" />
                <span className="text-sm font-medium text-foreground">{SLOT_LABELS[slot]}</span>
                <span className="text-xs">
                  or <span className="underline underline-offset-2">browse files</span>
                </span>
              </>
            ) : (
              <>
                <PlusIcon className="size-4" />
                <span className="text-xs">Add</span>
              </>
            )}
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
                  onClick={(event) => {
                    event.stopPropagation()
                    inputRef.current?.click()
                  }}
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
                  onClick={(event) => {
                    event.stopPropagation()
                    void remove()
                  }}
                >
                  <XIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove photo</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      {large && !address ? null : (
        <figcaption className={cn("text-xs text-muted-foreground", !large && "text-center")}>{SLOT_LABELS[slot]}</figcaption>
      )}
      {canEdit ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Choose the ${SLOT_LABELS[slot].toLowerCase()} photo`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      ) : null}
    </figure>
  )
}
