import * as React from "react"

/**
 * The admin-set logo above every signed-out page.
 *
 * It renders nothing at all when no logo is set, so the pages look exactly as
 * they did before anyone set one. It also renders nothing when the picture
 * fails to load — the file behind it can be deleted from the media library
 * without warning, and an empty space is a better first impression than a
 * broken-image glyph. The app name below it stays either way, so the page never
 * loses the one thing that says which app this is.
 */
export function BrandLogo({ src, appName }: { src: string; appName: string }) {
  // Remembering which address failed, rather than a plain yes/no, is what lets
  // a newly chosen logo have its own go at loading.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const imageRef = React.useRef<HTMLImageElement>(null)

  // These pages are rendered on the server, so the browser can try the picture
  // — and give up on it — before React gets here to attach the onError below.
  // A missing file would then sit on the page as a broken-image glyph forever.
  // Asking the element what happened is the only way to catch that one.
  React.useEffect(() => {
    const image = imageRef.current
    if (image && image.complete && image.naturalWidth === 0) {
      setFailedSrc(image.currentSrc || src)
    }
  }, [src])

  if (!src || failedSrc === src) {
    return null
  }

  return (
    <img
      ref={imageRef}
      src={src}
      alt={appName}
      className="h-12 max-w-56 object-contain"
      onError={() => setFailedSrc(src)}
    />
  )
}
