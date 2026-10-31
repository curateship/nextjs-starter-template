import * as React from "react"

/**
 * A video's cover picture, or `fallback` when it has none or it will not
 * load. TikTok's cover addresses expire after a few days, so without this an
 * old TikTok shows the browser's broken-picture icon.
 */
export function CoverImage({
  src,
  className,
  fallback,
}: {
  src: string | null | undefined
  className?: string
  fallback: React.ReactNode
}) {
  // Kept as the address that failed, so a new address gets its own try.
  const [failed, setFailed] = React.useState<string | null>(null)
  if (!src || failed === src) return <>{fallback}</>
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(src)}
    />
  )
}
