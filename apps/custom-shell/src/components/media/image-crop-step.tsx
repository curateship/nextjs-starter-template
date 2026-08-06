import * as React from "react"
import { CropIcon, Loader2Icon } from "lucide-react"
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type Crop,
} from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cropImageToFile, scaledSize } from "@/lib/media/crop-image"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { getMediaErrorMessage } from "@/lib/api/media"

export type CropAspectKey = "free" | "square" | "wide"

/**
 * The fixed-ratio presets. Square is what avatars and favicons need; wide
 * (16:9) matches the cover/banner fields. When the avatars work lands it must
 * reuse this step, not grow a second cropper.
 */
const ASPECT_PRESETS: { key: CropAspectKey; label: string; ratio?: number }[] =
  [
    { key: "free", label: "Free" },
    { key: "square", label: "Square", ratio: 1 },
    { key: "wide", label: "Wide", ratio: 16 / 9 },
  ]

const MAX_SIZE_OPTIONS = [
  { value: "original", label: "Full size" },
  { value: "2048", label: "Up to 2048 px" },
  { value: "1024", label: "Up to 1024 px" },
  { value: "512", label: "Up to 512 px" },
] as const

type MaxSizeKey = (typeof MAX_SIZE_OPTIONS)[number]["value"]

/**
 * The crop-and-resize view of the media picker: header, body, and footer for
 * the same open dialog, swapped in while a just-picked image waits to upload.
 * It never talks to the server — it hands back a File (cropped or the
 * untouched original) and the normal upload flow takes it from there.
 */
export function ImageCropStep({
  file,
  previewUrl,
  defaultAspect = "free",
  onDone,
  onCancel,
}: {
  file: File
  /** A blob address for the file, owned (created and revoked) by the caller. */
  previewUrl: string
  defaultAspect?: CropAspectKey
  /** Receives the file to stage for upload — cropped, or the original. */
  onDone: (file: File) => void
  onCancel: () => void
}) {
  const [aspectKey, setAspectKey] = React.useState<CropAspectKey>(defaultAspect)
  const [maxSize, setMaxSize] = React.useState<MaxSizeKey>("original")
  const [crop, setCrop] = React.useState<Crop>()
  const [busy, setBusy] = React.useState(false)
  // The photo's real resolution, known once it loads. Held in state (not read
  // off the ref) so the size readout below recomputes with the render.
  const [naturalSize, setNaturalSize] = React.useState<{
    width: number
    height: number
  } | null>(null)
  const imageRef = React.useRef<HTMLImageElement>(null)

  const aspect = ASPECT_PRESETS.find(
    (preset) => preset.key === aspectKey
  )?.ratio

  /** A centered selection: the whole image for Free, the largest fit for a ratio. */
  const initialCrop = React.useCallback(
    (width: number, height: number, ratio: number | undefined): Crop => {
      if (!ratio) return { unit: "%", x: 0, y: 0, width: 100, height: 100 }
      return centerCrop(
        makeAspectCrop({ unit: "%", width: 100 }, ratio, width, height),
        width,
        height
      )
    },
    []
  )

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    setCrop(initialCrop(image.width, image.height, aspect))
    setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
  }

  function handleAspectChange(key: string) {
    const nextKey = key as CropAspectKey
    setAspectKey(nextKey)
    const image = imageRef.current
    if (!image) return
    const ratio = ASPECT_PRESETS.find((preset) => preset.key === nextKey)?.ratio
    setCrop(initialCrop(image.width, image.height, ratio))
  }

  const maxDimension = maxSize === "original" ? null : Number(maxSize)

  // What the saved file will measure, kept live beside the controls so the
  // size cap's effect is visible before anything uploads. The percent crop
  // maps straight onto the photo's real resolution, so the on-screen size
  // never enters into it.
  const outputSize = React.useMemo(() => {
    if (!naturalSize || !crop || crop.unit !== "%") return null
    if (crop.width < 0.1 || crop.height < 0.1) return null
    return scaledSize(
      Math.max(1, Math.round((crop.width / 100) * naturalSize.width)),
      Math.max(1, Math.round((crop.height / 100) * naturalSize.height)),
      maxDimension,
      aspect
    )
  }, [crop, naturalSize, maxDimension, aspect])

  async function handleApply() {
    const image = imageRef.current
    if (!image || !crop) return

    const pixelCrop = convertToPixelCrop(crop, image.width, image.height)
    if (pixelCrop.width < 1 || pixelCrop.height < 1) {
      showErrorToast("Drag out an area to keep before applying the crop.")
      return
    }

    setBusy(true)
    dismissErrorToast()
    try {
      onDone(
        await cropImageToFile({
          image,
          file,
          crop: pixelCrop,
          maxDimension,
          aspect,
        })
      )
    } catch (cropError) {
      showErrorToast(getMediaErrorMessage(cropError))
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Crop image</DialogTitle>
      </DialogHeader>

      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Crop and resize</CardTitle>
            <CardDescription>
              Drag the corners to keep just the part you want, or use the
              original as is.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="image-crop-shape"
                  hint="Square fits avatars, favicons, and logos. Wide fits covers and banners."
                >
                  Shape
                </FieldLabel>
                <Tabs value={aspectKey} onValueChange={handleAspectChange}>
                  <TabsList id="image-crop-shape">
                    {ASPECT_PRESETS.map((preset) => (
                      <TabsTrigger key={preset.key} value={preset.key}>
                        {preset.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="image-crop-max-size"
                  hint="Shrinks the saved image so its longest side stays under this many pixels. Smaller files load faster."
                >
                  Max size
                </FieldLabel>
                <Select
                  value={maxSize}
                  onValueChange={(value) => setMaxSize(value as MaxSizeKey)}
                >
                  <SelectTrigger
                    id="image-crop-max-size"
                    className="w-full sm:w-fit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAX_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {outputSize ? (
                <p
                  className="text-xs text-muted-foreground sm:ml-auto sm:self-end sm:pb-2"
                  role="status"
                >
                  Saves at {outputSize.width} × {outputSize.height} px
                </p>
              ) : null}
            </div>

            <div className="flex justify-center rounded-lg border bg-muted/30 p-3">
              <ReactCrop
                crop={crop}
                // The percent form survives the dialog resizing; on-screen
                // pixels would drift with it.
                onChange={(_, percent) => setCrop(percent)}
                aspect={aspect}
                keepSelection
                minWidth={16}
                minHeight={16}
                // The height cap goes on the ReactCrop root — its stylesheet
                // gives the inner image `max-height: inherit`, which both
                // overrides a cap set on the image itself and passes this one
                // down. Sized to the window (25rem of dialog chrome measured
                // around it) so the crop step never scrolls: in a scrolling
                // body the footer gap — the body's own bottom padding —
                // scrolls out of sight, and dragging handles in a scroll area
                // fights the scroll.
                className="max-h-[clamp(240px,calc(100vh_-_25rem),420px)]"
              >
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt={`Crop preview of ${file.name}`}
                  onLoad={handleImageLoad}
                  onError={() => {
                    // The browser cannot draw this file, so there is nothing
                    // to crop — keep the original and let the upload decide.
                    showErrorToast(
                      "This image could not be opened for cropping, so the original file was kept."
                    )
                    onDone(file)
                  }}
                />
              </ReactCrop>
            </div>
          </CardContent>
        </Card>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="mr-auto"
          disabled={busy}
          onClick={() => onDone(file)}
        >
          Use original
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={handleApply}>
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CropIcon className="size-4" />
          )}
          Apply crop
        </Button>
      </DialogFooter>
    </>
  )
}
