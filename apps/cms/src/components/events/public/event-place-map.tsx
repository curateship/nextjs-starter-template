import * as React from "react"

import {
  loadGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
} from "@/lib/directory/google-maps"

/**
 * A small map of where an event is, with one pin. It uses the same Google
 * loader and the same site key as the directory's map. If Google does not
 * load, the map is simply left out; the place is written out above it and the
 * Directions link still works, so nothing is lost.
 */
export function EventPlaceMap({
  apiKey,
  position,
  placeName,
}: {
  apiKey: string
  position: { latitude: number; longitude: number }
  placeName: string
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<GoogleMap | null>(null)
  const markerRef = React.useRef<GoogleMarker | null>(null)
  const [failed, setFailed] = React.useState(false)
  const { latitude, longitude } = position

  React.useEffect(() => {
    let cancelled = false

    async function draw() {
      let maps
      try {
        maps = await loadGoogleMaps(apiKey)
      } catch {
        if (!cancelled) setFailed(true)
        return
      }
      const container = containerRef.current
      if (cancelled || !container) return

      const centre = { lat: latitude, lng: longitude }
      mapRef.current = new maps.Map(container, {
        center: centre,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        // Google's own points of interest would open Google's cards, not this
        // site's pages.
        clickableIcons: false,
      })
      markerRef.current?.setMap(null)
      markerRef.current = new maps.Marker({
        position: centre,
        map: mapRef.current,
        title: placeName,
        clickable: false,
      })
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [apiKey, latitude, longitude, placeName])

  // The pin belongs to Google's map, not to React, so it is taken off by hand.
  React.useEffect(
    () => () => {
      markerRef.current?.setMap(null)
      markerRef.current = null
      mapRef.current = null
    },
    []
  )

  if (failed) return null
  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={placeName ? `Map of ${placeName}` : "Map of the event's place"}
      className="h-56 w-full overflow-hidden rounded-md border bg-muted"
    />
  )
}
