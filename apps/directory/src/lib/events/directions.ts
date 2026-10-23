/**
 * The "Directions" link on an event page: Google Maps with the place as the
 * destination, which a phone opens in its maps app. No key is needed.
 *
 * A known position is the most exact destination. Without one, the place's
 * name and address are sent as words for Google to find. Nothing to go on
 * means no link.
 */
export function eventDirectionsUrl(place: {
  position: { latitude: number; longitude: number } | null
  placeName: string
  placeAddress: string
}): string | null {
  const destination = place.position
    ? `${place.position.latitude},${place.position.longitude}`
    : [place.placeName, place.placeAddress]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ")
  if (!destination) return null
  const params = new URLSearchParams({ api: "1", destination })
  return `https://www.google.com/maps/dir/?${params}`
}
