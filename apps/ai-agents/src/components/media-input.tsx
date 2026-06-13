import * as React from "react"
import { ImageIcon, PlayIcon, VideoIcon, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MediaInputProps = {
  label: string
  value: string
  onChange: (value: string, altText?: string) => void
  placeholder?: string
  description?: string
  acceptVideo?: boolean
  hideUrlInput?: boolean
}

export function MediaInput({
  label,
  value,
  onChange,
  placeholder = "Enter media URL or select from library",
  description,
  acceptVideo = true,
  hideUrlInput = false,
}: MediaInputProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const mediaType = getMediaType(value)

  return (
    <div className="space-y-3">
      <Label>{label}</Label>

      {value ? (
        <div className="group relative max-w-xs overflow-hidden rounded-lg border bg-muted">
          <div className="relative aspect-video">
            {mediaType === "video" ? (
              <>
                <video src={value} className="h-full w-full object-contain" muted playsInline />
                <div className="absolute inset-0 grid place-items-center">
                  <span className="rounded-full bg-black/50 p-2">
                    <PlayIcon className="size-5 fill-white text-white" />
                  </span>
                </div>
              </>
            ) : (
              <img src={value} alt={label} className="h-full w-full object-contain" />
            )}
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onChange("")}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Clear media</span>
          </Button>
        </div>
      ) : null}

      {!hideUrlInput ? (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
            <ImageIcon className="size-4" />
            Library
          </Button>
        </div>
      ) : null}

      {!value ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <div className="mb-3 flex justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8" />
            {acceptVideo ? <VideoIcon className="size-8" /> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <ImageIcon className="size-4" />
            Choose from Library
          </Button>
        </div>
      ) : null}

      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl, altText) => onChange(mediaUrl, altText)}
        currentMediaUrl={value}
        showVideos={acceptVideo}
      />
    </div>
  )
}

function getMediaType(url: string): "image" | "video" {
  let target = url
  try {
    const parsed = new URL(url, "http://ai-agents.local")
    target = parsed.searchParams.get("name") ?? parsed.pathname
  } catch {
    target = url
  }

  const extension = target.split(".").pop()?.toLowerCase()
  return ["mp4", "webm", "mov", "avi", "mkv"].includes(extension ?? "") ? "video" : "image"
}
