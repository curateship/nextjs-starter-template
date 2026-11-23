import { EyeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThumbnailPreview } from "@/components/video-thumbnails/thumbnail-layer"
import { useThumbnails } from "@/components/video-thumbnails/thumbnail-store"
import type { ThumbnailDesign, ThumbnailShape } from "@/lib/video/thumbnails"
import { cn } from "@/lib/utils"

/**
 * "Preview" in the editor's top bar while the Thumbnail section is open
 * (Tyler, 3 Nov 2026): a dropdown showing the open thumbnail at the sizes
 * YouTube shows it, beside its title (part 8). It sits left of Share.
 */
export function ThumbnailPreviewButton() {
  const { open, design } = useThumbnails()
  if (!open || !design) return null
  const shown = { ...design, shape: open.shape }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <EyeIcon />
          Preview
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <ScrollArea viewportClassName="max-h-[min(80vh,40rem)]">
          <div className="p-4">
            <YouTubeSizes design={shown} title={open.title} />
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The thumbnail at the sizes YouTube shows it, beside its title (part 8).
 * These widths are a first guess and have not been measured on youtube.com
 * yet (thumbnails.md says so). YouTube also changes them with the window.
 */
const YOUTUBE_SIZES: Record<ThumbnailShape, { label: string; width: number }[]> = {
  wide: [
    { label: "Home feed", width: 360 },
    { label: "Phone", width: 320 },
    { label: "Up next", width: 168 },
  ],
  tall: [
    { label: "Shorts shelf", width: 180 },
    { label: "Phone", width: 120 },
  ],
}

function YouTubeSizes({ design, title }: { design: ThumbnailDesign; title: string | null }) {
  return (
    <section aria-label="How it looks on YouTube" className="grid gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">How it looks on YouTube</h3>
      <div className="flex flex-wrap items-start gap-4">
        {YOUTUBE_SIZES[design.shape].map((size) => (
          <figure key={size.label} className="grid gap-1.5" style={{ width: size.width }}>
            <div className="overflow-hidden rounded-lg">
              <ThumbnailPreview design={design} width={size.width} filterKey={`yt-${size.label}`} />
            </div>
            <figcaption className="grid gap-0.5">
              <span className={cn("line-clamp-2 text-sm font-medium", !title && "text-muted-foreground")}>
                {title || "Pick a title on the left"}
              </span>
              <span className="text-xs text-muted-foreground">{size.label} · Your channel</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
