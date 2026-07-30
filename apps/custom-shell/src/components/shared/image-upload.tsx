import * as React from "react"
import { ImagePlus, PlayIcon, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type ImageUploadProps = {
  label: string
  value: string
  onChange: (value: string, altText?: string) => void
  aspect?: "video" | "square"
  fit?: "cover" | "contain"
  emptyLabel?: string
  description?: string
  showVideos?: boolean
  showLabel?: boolean
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
  description,
  showVideos = false,
  showLabel = true,
  className,
}: ImageUploadProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-video"
  const fitClass = fit === "contain" ? "object-contain" : "object-cover"
  const isVideo = showVideos && getMediaType(value) === "video"

  return (
    <div className={cn("w-full space-y-2", className)}>
      {showLabel ? <Label>{label}</Label> : null}

      <div className="group relative w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="block w-full cursor-pointer overflow-hidden rounded-lg border-2 border-dashed outline-none transition-colors focus-visible:border-ring"
          aria-label={value ? `Change ${label.toLowerCase()}` : `Select ${label.toLowerCase()}`}
        >
          {value ? (
            <div className={cn("relative bg-muted/50", aspectClass)}>
              {isVideo ? (
                <>
                  <video src={value} className={cn("h-full w-full", fitClass)} muted playsInline />
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="rounded-full bg-black/50 p-2">
                      <PlayIcon className="size-5 fill-white text-white" />
                    </span>
                  </div>
                </>
              ) : (
                <img src={value} alt={label} className={cn("h-full w-full", fitClass)} />
              )}
            </div>
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
            className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 rounded-full shadow-md ring-2 ring-white/70"
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

      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl, altText) => onChange(mediaUrl, altText)}
        currentMediaUrl={value}
        showVideos={showVideos}
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
