import * as React from "react"

import { cn } from "@/lib/utils"

type PrivateMediaImageProps = {
  src: string
  alt: string
  className?: string
}

export function PrivateMediaImage({ src, alt, className }: PrivateMediaImageProps) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const shouldProxy = src.startsWith("/api/v1/media/")

  React.useEffect(() => {
    let activeObjectUrl: string | null = null
    let cancelled = false

    setObjectUrl(null)

    if (!shouldProxy) return

    fetch(src, { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load media")
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        activeObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(activeObjectUrl)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl)
    }
  }, [shouldProxy, src])

  if (!shouldProxy) {
    return <img src={src} alt={alt} className={className} />
  }

  if (!objectUrl) {
    return <div className={cn("bg-muted", className)} aria-label={alt} />
  }

  return <img src={objectUrl} alt={alt} className={className} />
}
