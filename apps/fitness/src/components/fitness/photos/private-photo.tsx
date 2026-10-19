import * as React from "react"
import { ImageOffIcon, Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * One before and after photo, fetched from its private address and drawn from
 * memory rather than pointed at by an image tag.
 *
 * The local dev server hands every request a browser makes for an image to
 * its own static files, which answer 404 for an app's address, so a plain
 * `<img src="/api/fitness/photos/...">` shows nothing locally. The live server
 * has no such step; fetching works on both. Project draws task pictures the
 * same way (`SmallPicture` in `apps/project/.../task-files-card.tsx`).
 */
export function PrivatePhoto({
  src,
  alt,
  className,
  style,
}: {
  src: string
  alt: string
  className?: string
  style?: React.CSSProperties
}) {
  const [loaded, setLoaded] = React.useState<{ src: string; url: string | null; failed: boolean } | null>(null)

  React.useEffect(() => {
    let url: string | null = null
    let live = true
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.blob()
      })
      .then(
        (blob) => {
          if (!live) return
          url = URL.createObjectURL(blob)
          setLoaded({ src, url, failed: false })
        },
        () => {
          if (live) setLoaded({ src, url: null, failed: true })
        }
      )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [src])

  const current = loaded?.src === src ? loaded : null
  if (!current?.url) {
    return (
      <span
        role="img"
        aria-label={current?.failed ? `${alt} could not be loaded` : `Loading ${alt}`}
        className={cn("flex items-center justify-center", className)}
        style={style}
      >
        {current?.failed ? (
          <ImageOffIcon className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />
        )}
      </span>
    )
  }
  return <img src={current.url} alt={alt} className={className} style={style} draggable={false} />
}
