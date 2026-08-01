"use client"

import Image from "@/components/app-image"
import { useImageFallback } from "@/components/shared/listing-image"
import { cn } from "@/lib/utils/tailwind"
import { resolveMediaUrl } from "@/lib/utils/media-url"

/**
 * The two places a search result's picture appears: the suggestion dropdown and
 * the results list. Kept in one component so the two never drift apart.
 */
const SIZES = {
  sm: {
    width: 32,
    height: 32,
    image: "size-8 shrink-0 rounded-sm object-cover",
    placeholder: "size-8 shrink-0 rounded-sm bg-muted",
  },
  lg: {
    width: 96,
    height: 96,
    image: "h-24 w-full rounded-md object-cover sm:w-24",
    // Hidden on mobile, where the single-column layout has no picture slot.
    placeholder: "hidden h-24 w-24 rounded-md bg-muted sm:block",
  },
} as const

interface SiteSearchThumbnailProps {
  image: string | null
  size: keyof typeof SIZES
  className?: string
}

/** A search result's picture, or a muted tile when the item has none — or when the picture won't load. */
export function SiteSearchThumbnail({ image, size, className }: SiteSearchThumbnailProps) {
  const styles = SIZES[size]
  // Stored media references are not always usable as-is: `r2://` keys are only
  // served through the media proxy. Every other public block resolves them the
  // same way.
  const src = resolveMediaUrl(image)
  const { imageRef, failed, onError } = useImageFallback(src)

  if (!src || failed) return <span className={cn(styles.placeholder, className)} />

  return (
    <Image
      ref={imageRef}
      src={src}
      alt=""
      width={styles.width}
      height={styles.height}
      className={cn(styles.image, className)}
      onError={onError}
    />
  )
}
