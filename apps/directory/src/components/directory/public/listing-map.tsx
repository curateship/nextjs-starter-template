import { ListingCard } from "@/components/directory/public/listing-grid"
import { PinMap } from "@/components/directory/public/pin-map"
import type { PublicMapPin } from "@/lib/api/directory/public"
import {
  DEAL_MARKER_ICON,
  DIRECTORY_DEALS_ONLY_LABEL,
  directoryMapCapNotice,
  directoryPinLabel,
} from "@/lib/directory/listing-map"

/**
 * The browse page's results as pins.
 *
 * The same listings as the grid, drawn on a map, with the same card behind
 * each pin. The map itself is `PinMap`, which the Events page's map shares.
 *
 * A pin whose listing has a deal on gets the deal marker, and the card behind
 * it already shows the headline as its Deal tag.
 */
export function ListingMap({
  apiKey,
  pins,
  total,
  dealsOnly = false,
}: {
  apiKey: string
  pins: PublicMapPin[]
  /** Matching listings that have a location, before the cap. */
  total: number
  /**
   * The visitor asked for places with a deal on. Only changes what an empty map
   * says: the pins that arrive have already been narrowed by the server.
   */
  dealsOnly?: boolean
}) {
  return (
    <PinMap
      apiKey={apiKey}
      pins={pins}
      notice={directoryMapCapNotice(pins.length, total)}
      emptyText={
        dealsOnly
          ? `No place with a deal on is on this map. Switch ${DIRECTORY_DEALS_ONLY_LABEL} off to see every listing here.`
          : "None of these listings have a location yet, so there is nothing to put on a map. Switch back to the grid to see them."
      }
      failedText="The map could not be loaded. Switch back to the grid, or try again in a moment."
      regionLabel="Map of listings"
      groupLabel="Listings on this map"
      pinLabel={(pin) => directoryPinLabel(pin.title, pin.dealHeadline)}
      pinIcon={(pin) => (pin.dealHeadline ? DEAL_MARKER_ICON : undefined)}
      renderCard={(pin) => <ListingCard listing={pin} />}
    />
  )
}
