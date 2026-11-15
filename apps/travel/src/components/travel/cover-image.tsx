import * as React from "react"

/**
 * A trip's or place's picture, or `fallback` when it has none or its address
 * no longer loads, so a dead link never draws the browser's broken-picture
 * icon (Travel polish part 19). One copy for the Trips table, the Year and
 * Next trip widgets, the right panel and the Saved places window.
 */
export function CoverImage({
  url,
  className,
  fallback,
}: {
  url: string | null
  className: string
  fallback: React.ReactNode
}) {
  const [broken, setBroken] = React.useState<string | null>(null)
  if (!url || url === broken) return <>{fallback}</>
  return <img src={url} alt="" aria-hidden className={className} onError={() => setBroken(url)} />
}
