import * as React from "react"

/**
 * The cover picture of one export.
 *
 * It is fetched rather than handed to an `<img src>` on purpose: the export
 * routes ask for a signed-in session, and the dev server turns away a plain
 * picture request to an app route even when the same address answers a fetch
 * (the shell's own media route behaves the same way). Fetching it once and
 * drawing the bytes works the same in both places.
 */
export function ExportCover({
  exportId,
  version = 0,
  alt = "",
  className,
  fallback,
}: {
  exportId: string
  /** Bumped when a new moment is chosen, so the old picture is not reused. */
  version?: number
  alt?: string
  className?: string
  fallback: React.ReactNode
}) {
  const source = useExportCoverUrl(exportId, version)
  if (!source) return <>{fallback}</>
  return <img src={source} alt={alt} className={className} />
}

/** Holds the picture in memory for as long as it is on screen. */
function useExportCoverUrl(exportId: string, version: number) {
  const [source, setSource] = React.useState<string | null>(null)

  React.useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/video/exports/${exportId}/cover?v=${version}`
        )
        if (!response.ok) return
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
      } catch {
        // No cover to show is not worth saying anything about.
      }
    })()
    return () => {
      cancelled = true
      setSource(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [exportId, version])

  return source
}
