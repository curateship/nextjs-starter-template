"use client"

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react"
import ImageOff from "lucide-react/dist/esm/icons/image-off.js"
import Image from "@/components/app-image"
import { isBrokenImage } from "@/lib/utils/broken-image"

/**
 * Tells the caller whether a picture refused to load, so it can draw a
 * placeholder instead of leaving a hole.
 *
 * The failed URL is kept in state rather than written straight to the element's
 * style — no forced reflow, and a later item reusing the same slot with a
 * working URL still gets its picture. The mount check covers the failure
 * `onError` cannot see; `isBrokenImage` explains which one.
 */
export function useImageFallback(src: string) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const markFailed = useCallback(() => setFailedSrc(src), [src])

  useEffect(() => {
    const image = imageRef.current
    if (image && isBrokenImage(image, src)) markFailed()
  }, [markFailed, src])

  return { imageRef, failed: failedSrc === src, onError: markFailed }
}

/**
 * The muted tile a listing shows when it has no photo — and when the photo it
 * does have won't load. Fills its frame, so the card keeps its footprint.
 */
function ListingImagePlaceholder() {
  return (
    <span
      data-slot="listing-image-placeholder"
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted p-2 text-center text-muted-foreground"
    >
      <ImageOff className="size-5 shrink-0" aria-hidden="true" />
      <span className="text-xs leading-none">No Image</span>
    </span>
  )
}

type ListingImageProps = Omit<ComponentProps<typeof Image>, "src" | "ref" | "onError"> & {
  src: string | null | undefined
}

/** A listing photo that falls back to the placeholder rather than a blank space. */
export function ListingImage({ src, ...imageProps }: ListingImageProps) {
  const { imageRef, failed, onError } = useImageFallback(src || "")

  if (!src || failed) return <ListingImagePlaceholder />

  return <Image {...imageProps} ref={imageRef} src={src} onError={onError} />
}
