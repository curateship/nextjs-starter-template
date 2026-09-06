import * as React from "react"

import type { PublicHeaderLogoSize } from "@/lib/pages/public-header"
import { cn } from "@/lib/utils"

const LOGO_SIZE_CLASS_NAMES: Record<PublicHeaderLogoSize, string> = {
  small: "h-8 max-w-40",
  standard: "h-12 max-w-56",
  large: "h-16 max-w-48 sm:max-w-72",
}

/**
 * The admin-set logo above every signed-out page.
 *
 * Two logos can be set: the everyday one, and an optional second drawn for dark
 * backgrounds, because a logo drawn in near-black simply disappears on a dark
 * page. When both exist, **both are rendered and CSS hides one of them** — the
 * no-flash script in `__root.tsx` puts the `dark` class on the page before the
 * first paint, so the right logo is the one that ever appears. Choosing in
 * JavaScript after load would flash the wrong picture on a hard reload.
 *
 * It renders nothing at all when no logo is set, so the pages look exactly as
 * they did before anyone set one. Each picture also renders nothing when it
 * fails to load — the file behind it can be deleted from the media library
 * without warning, and an empty space is a better first impression than a
 * broken-image glyph. The app name below it stays either way, so the page never
 * loses the one thing that says which app this is.
 */
export function BrandLogo({
  src,
  darkSrc,
  appName,
  size = "standard",
}: {
  src: string
  darkSrc: string
  appName: string
  size?: PublicHeaderLogoSize
}) {
  // With no dark logo there is nothing to swap, so the one logo is drawn
  // unconditioned — exactly the markup this had before the second slot existed.
  if (!darkSrc) {
    return <LogoImage src={src} appName={appName} size={size} />
  }

  return (
    <>
      <LogoImage
        src={src}
        appName={appName}
        size={size}
        className="dark:hidden"
      />
      <LogoImage
        src={darkSrc}
        appName={appName}
        size={size}
        className="hidden dark:block"
      />
    </>
  )
}

function LogoImage({
  src,
  appName,
  size,
  className,
}: {
  src: string
  appName: string
  size: PublicHeaderLogoSize
  className?: string
}) {
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
      className={cn(LOGO_SIZE_CLASS_NAMES[size], "object-contain", className)}
      onError={() => setFailedSrc(src)}
    />
  )
}
