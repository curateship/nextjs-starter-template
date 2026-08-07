import * as React from "react"
import { ImagePlus, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { cn } from "@/lib/utils"

type ImageUploadProps = {
  label: string
  value: string
  onChange: (value: string, altText?: string) => void
  aspect?: "video" | "square"
  fit?: "cover" | "contain"
  emptyLabel?: string
  /** Help text, shown behind the label's info icon like every other field. */
  hint?: React.ReactNode
  showVideos?: boolean
  /** Keeps picker and crop steps inside the surrounding window. */
  inlinePicker?: boolean
  showLabel?: boolean
  /** Locks the field while the form around it is submitting. */
  disabled?: boolean
  className?: string
}

/**
 * The standard image picker: a dashed dropzone that shows the current image
 * with a corner remove-X badge. Clicking it opens the shared MediaPicker
 * (upload + library + persistence), so the stored value is always a real media
 * URL.
 */
export function ImageUpload({
  label,
  value,
  onChange,
  aspect = "video",
  fit = "cover",
  emptyLabel = "Add image",
  hint,
  showVideos = false,
  inlinePicker = false,
  showLabel = true,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-video"
  const isVideo = showVideos && getMediaType(value) === "video"

  return (
    <div className={cn("w-full space-y-2", className)}>
      {showLabel ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}

      <div className="group relative w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="block w-full cursor-pointer overflow-hidden rounded-lg border-2 border-dashed outline-none transition-colors focus-visible:border-ring disabled:cursor-default disabled:opacity-50"
          aria-label={value ? `Change ${label.toLowerCase()}` : `Select ${label.toLowerCase()}`}
        >
          {value ? (
            <MediaThumbnail
              url={value}
              fileType={isVideo ? "video" : "image"}
              alt={label}
              fit={fit}
              className={cn("bg-muted/50", aspectClass)}
            />
          ) : (
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 bg-muted/50 transition-colors group-hover:bg-muted",
                aspectClass
              )}
            >
              <ImagePlus className="size-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{emptyLabel}</span>
            </div>
          )}
        </button>

        {value ? (
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            disabled={disabled}
            className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 rounded-full shadow-md ring-2 ring-background"
            onClick={(event) => {
              event.stopPropagation()
              onChange("")
            }}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Remove {label.toLowerCase()}</span>
          </Button>
        ) : null}
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl, altText) => onChange(mediaUrl, altText)}
        currentMediaUrl={value}
        showVideos={showVideos}
        inline={inlinePicker}
        // The crop step starts on the shape this field needs — square for
        // favicons, logos, and avatars; wide for covers and banners.
        defaultCropAspect={aspect === "square" ? "square" : "wide"}
      />
    </div>
  )
}

function getMediaType(url: string): "image" | "video" {
  let target = url
  try {
    const parsed = new URL(url, "http://custom-shell.local")
    target = parsed.searchParams.get("name") ?? parsed.pathname
  } catch {
    target = url
  }

  const extension = target.split(".").pop()?.toLowerCase()
  return ["mp4", "webm", "mov", "avi", "mkv"].includes(extension ?? "") ? "video" : "image"
}
