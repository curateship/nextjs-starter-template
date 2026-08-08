import * as React from "react"
import { AudioLinesIcon, FileQuestionIcon, PlayIcon } from "lucide-react"

import { videoPosterSrc } from "@/lib/media/media-upload"
import { cn } from "@/lib/utils"

/**
 * One still frame for a library item, used everywhere media is listed.
 *
 * Videos have no stored poster image. The frame is the video itself seeked to
 * its first moment — see `videoPosterSrc` — which costs a range request for the
 * header and one frame instead of a second file in storage. A browser that
 * cannot decode the format (AVI and MKV, mostly) or a file that has gone
 * missing raises an error rather than painting, so both land on an icon instead
 * of a black square or a broken-image glyph.
 */
export function MediaThumbnail({
  url,
  fileType,
  alt,
  className,
  fit = "contain",
  compact = false,
  showPlayBadge = true,
}: {
  url: string
  fileType: "image" | "video" | "audio"
  alt: string
  className?: string
  fit?: "contain" | "cover"
  /** For thumbnails around 80px and under, where the full badge would cover it. */
  compact?: boolean
  /** Turn off where the caller puts a real play button in the same spot. */
  showPlayBadge?: boolean
}) {
  // Remembering which address failed, rather than a plain yes/no, is what lets
  // a new file in the same slot have its own go at loading.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null)
  const failed = failedUrl === url
  const fitClass = fit === "cover" ? "object-cover" : "object-contain"

  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden", className)}
    >
      {failed ? (
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <FileQuestionIcon className="size-6" />
          <span className="text-[10px] leading-tight">No preview</span>
        </div>
      ) : fileType === "audio" ? (
        // Sound has nothing to show, so it says what it is rather than
        // pretending to be a picture that failed to load.
        <div className="grid place-items-center gap-1 p-2 text-center text-muted-foreground">
          <AudioLinesIcon className="size-6" />
          {compact ? null : (
            <span className="text-[10px] leading-tight">Sound</span>
          )}
        </div>
      ) : fileType === "video" ? (
        <>
          <video
            src={videoPosterSrc(url)}
            className={cn("h-full w-full", fitClass)}
            preload="metadata"
            muted
            playsInline
            aria-label={alt}
            onError={() => setFailedUrl(url)}
          />
          {showPlayBadge ? <PlayBadge compact={compact} /> : null}
        </>
      ) : (
        <img
          src={url}
          alt={alt}
          className={cn("h-full w-full", fitClass)}
          // A grid of these is mostly below the fold. Left to itself the browser
          // starts every original at once; asked to wait, it fetches a tile when
          // the tile is scrolled to. The box is already sized by its caller, so
          // nothing moves when the picture finally lands.
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      )}
    </div>
  )
}

/** Marks a still frame as a video, so it is not mistaken for a photo. */
function PlayBadge({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute grid place-items-center rounded-full bg-foreground/60",
        compact ? "p-1" : "p-2",
        className
      )}
    >
      <PlayIcon
        className={cn(
          "fill-background text-background",
          compact ? "size-3" : "size-5"
        )}
      />
    </span>
  )
}
