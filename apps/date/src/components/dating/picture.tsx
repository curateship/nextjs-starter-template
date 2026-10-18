import * as React from "react"
import { ImageOffIcon, Loader2Icon, UserRoundIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * One of the member's Date pictures: a card's photo, a step's screenshot or a
 * stop screen. Fetched and drawn from a blob address rather than pointed at
 * with an image tag, because the dev server answers an image tag pointed at an
 * app route with a 404 (Nitro hands image requests to its static files). The
 * picture address checks the session either way.
 *
 * Each picture is fetched once per page: a picture never changes once kept,
 * and the dashboard redraws every few seconds.
 */

const fetched = new Map<string, Promise<string>>()

function pictureUrl(pictureId: string): Promise<string> {
  let url = fetched.get(pictureId)
  if (!url) {
    url = fetch(`/api/dating/picture/${encodeURIComponent(pictureId)}`).then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.blob().then((blob) => URL.createObjectURL(blob))
    })
    // A failure is not remembered, so the next draw tries again.
    url.catch(() => fetched.delete(pictureId))
    fetched.set(pictureId, url)
  }
  return url
}

export function DatingPicture({
  pictureId,
  alt,
  className,
  fit = "cover",
}: {
  pictureId: string | null
  alt: string
  className?: string
  fit?: "cover" | "contain"
}) {
  const [loaded, setLoaded] = React.useState<{ id: string; src: string } | null>(null)
  const [failedId, setFailedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!pictureId) return
    let live = true
    pictureUrl(pictureId).then(
      (src) => live && setLoaded({ id: pictureId, src }),
      () => live && setFailedId(pictureId)
    )
    return () => {
      live = false
    }
  }, [pictureId])

  const src = loaded && loaded.id === pictureId ? loaded.src : null
  if (!pictureId || !src) {
    const failed = !pictureId || failedId === pictureId
    return (
      <span className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)} role="img" aria-label={alt}>
        {!pictureId ? (
          <UserRoundIcon className="size-1/3 max-h-8 max-w-8" aria-hidden />
        ) : failed ? (
          <ImageOffIcon className="size-4" aria-hidden />
        ) : (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        )}
      </span>
    )
  }
  return <img src={src} alt={alt} className={cn(fit === "cover" ? "object-cover" : "object-contain", className)} />
}
