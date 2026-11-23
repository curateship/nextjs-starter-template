"use client"

import { useEffect, useRef, useState } from "react"
import { MarkerClusterer } from "@googlemaps/markerclusterer"
import { loadGoogleMaps } from "@/lib/utils/google-maps-loader"
import type { ListingViewsItem } from "@/lib/actions/pages/page-listing-views-actions"

export interface MappableListing {
  id: string
  title: string
  slug: string
  address: string | null
  latitude: number
  longitude: number
  featured: boolean
}

export function getMappableListings(items: ListingViewsItem[]): MappableListing[] {
  return items.flatMap((item) =>
    item.latitude != null && item.longitude != null
      ? [{
          id: item.id,
          title: item.title,
          slug: item.slug,
          address: item.address,
          latitude: item.latitude,
          longitude: item.longitude,
          featured: item.featured,
        }]
      : []
  )
}

// InfoWindow content built via DOM APIs (textContent) so listing text can never
// inject markup into the map overlay.
function buildInfoContent(listing: MappableListing, href: string) {
  const root = document.createElement("div")
  root.style.cssText = "max-width:220px;font-family:inherit;display:grid;gap:4px;padding:2px;"

  const title = document.createElement("div")
  title.textContent = listing.title
  title.style.cssText = "font-weight:600;font-size:14px;"
  root.appendChild(title)

  if (listing.address) {
    const address = document.createElement("div")
    address.textContent = listing.address
    address.style.cssText = "font-size:12px;color:#555;"
    root.appendChild(address)
  }

  const link = document.createElement("a")
  link.href = href
  link.textContent = "View listing"
  link.style.cssText = "font-size:13px;font-weight:600;color:#1d4ed8;text-decoration:underline;"
  root.appendChild(link)

  return root
}

interface ListingMapViewProps {
  apiKey: string
  listings: MappableListing[]
  urlPrefix: string
}

export function ListingMapView({ apiKey, listings, urlPrefix }: ListingMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      if (!containerRef.current || listings.length === 0) return

      let maps: typeof google
      try {
        maps = await loadGoogleMaps(apiKey)
        await maps.maps.importLibrary("maps")
        await maps.maps.importLibrary("marker")
      } catch {
        if (!cancelled) setFailed(true)
        return
      }
      if (cancelled || !containerRef.current) return

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: listings[0].latitude, lng: listings[0].longitude },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })
        infoWindowRef.current = new google.maps.InfoWindow()
      }
      const map = mapRef.current
      const infoWindow = infoWindowRef.current!

      clustererRef.current?.clearMarkers()

      const bounds = new google.maps.LatLngBounds()
      const markers = listings.map((listing) => {
        const position = { lat: listing.latitude, lng: listing.longitude }
        bounds.extend(position)
        const marker = new google.maps.Marker({
          position,
          title: listing.title,
        })
        marker.addListener("click", () => {
          infoWindow.setContent(buildInfoContent(listing, `/${urlPrefix ? `${urlPrefix}/` : ""}${listing.slug}`))
          infoWindow.open({ map, anchor: marker })
        })
        return marker
      })

      clustererRef.current = new MarkerClusterer({ map, markers })

      if (markers.length === 1) {
        map.setCenter(bounds.getCenter())
        map.setZoom(14)
      } else {
        map.fitBounds(bounds, 48)
        // Don't over-zoom when all pins sit close together.
        google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > 15) map.setZoom(15)
        })
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [apiKey, listings, urlPrefix])

  useEffect(() => () => {
    clustererRef.current?.clearMarkers()
    infoWindowRef.current?.close()
    mapRef.current = null
  }, [])

  if (failed) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
        The map could not be loaded.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of listings"
      className="h-[420px] w-full overflow-hidden rounded-xl md:h-[560px]"
    />
  )
}
