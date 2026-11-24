import { ListingCard } from "@/components/directory/public/listing-grid"
import { PinMap } from "@/components/directory/public/pin-map"
import type { PublicMapPin } from "@/lib/api/directory/public"
import { DEAL_MARKER_ICON, directoryPinLabel } from "@/lib/directory/listing-map"

/**
 * A guide's places as pins, above its list (Tyler's pick, 24 Nov 2026: "A
 * map on a guide"). The same pins and cards as the front page's map row,
 * with a guide's own words: a guide page has no grid to switch back to.
 * The server only sends one with two pins or more.
 */
export function GuideMap({ apiKey, pins }: { apiKey: string; pins: PublicMapPin[] }) {
  return (
    <PinMap
      apiKey={apiKey}
      pins={pins}
      notice={null}
      emptyText="None of the places in this guide are on the map yet."
      failedText="The map could not be loaded. The places are listed below."
      regionLabel="Map of the places in this guide"
      groupLabel="Places in this guide"
      pinLabel={(pin) => directoryPinLabel(pin.title, pin.dealHeadline)}
      pinIcon={(pin) => (pin.dealHeadline ? DEAL_MARKER_ICON : undefined)}
      renderCard={(pin) => <ListingCard listing={pin} />}
    />
  )
}
