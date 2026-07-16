"use client"

import type { LucideIcon } from "lucide-react"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"

/** Clickable logo preview with favicon fallback and empty-state placeholder. */
export function LogoPickerPreview({
  logo,
  siteFavicon,
  onClick,
  placeholderIcon: PlaceholderIcon = ImageIcon,
}: {
  logo?: string
  siteFavicon?: string | null
  onClick: () => void
  placeholderIcon?: LucideIcon
}) {
  if (logo && logo !== "/images/logo.png") {
    return (
      <div
        className="relative h-12 w-32 cursor-pointer overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90"
        onClick={onClick}
      >
        <img
          src={logo}
          alt="Logo"
          className="h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none"
          }}
        />
        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
          <div className="text-center text-white">
            <ImageIcon className="mx-auto mb-1 h-4 w-4" />
            <p className="text-xs font-medium">Click to change</p>
          </div>
        </div>
      </div>
    )
  }

  if (siteFavicon) {
    return (
      <div className="cursor-pointer" onClick={onClick}>
        <img
          src={siteFavicon}
          alt="Site favicon (used as logo)"
          className="h-10 w-auto cursor-pointer object-contain"
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-12 w-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
      onClick={onClick}
    >
      <div className="text-center">
        <PlaceholderIcon className="mx-auto h-4 w-4 text-muted-foreground/50" />
        <p className="mt-1 text-xs text-muted-foreground">Click to select</p>
      </div>
    </div>
  )
}
