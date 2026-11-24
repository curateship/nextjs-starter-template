import * as React from "react"
import { StoreIcon } from "lucide-react"

/**
 * The listing's featured photo before its name, on the Listings row and a
 * category's Listings card: 28px with rounded corners, the size of a
 * person's avatar in the CRM's rows (Tyler, 18 Nov 2026: "Add a thumbnail
 * for the listing"). One with no photo shows the shop icon on the
 * same grey square, so every name starts at the same place.
 */
export function ListingThumbnail({ url }: { url: string }) {
  const [broken, setBroken] = React.useState(false)
  return url && !broken ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className="size-7 shrink-0 rounded-md bg-muted object-cover"
    />
  ) : (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <StoreIcon className="size-3.5" />
    </span>
  )
}
