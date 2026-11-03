import * as React from "react"
import { MapIcon } from "lucide-react"

import { useTravelServices } from "@/components/travel/use-travel-services"

export type MapPin = {
  id: string
  lat: number
  lng: number
  /** Shown on the pin, such as "1". */
  label?: string
  /** Shown on hover. */
  title: string
  /** The pin's fill, a CSS colour. */
  color?: string
}

type GoogleMaps = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => {
      fitBounds: (bounds: unknown, padding?: number) => void
      setCenter: (point: { lat: number; lng: number }) => void
      setZoom: (zoom: number) => void
    }
    Marker: new (options: Record<string, unknown>) => {
      addListener: (event: string, handler: () => void) => void
      setMap: (map: unknown) => void
    }
    LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void }
    SymbolPath: { CIRCLE: unknown }
  }
}

declare global {
  interface Window {
    google?: GoogleMaps
  }
}

let loading: Promise<GoogleMaps> | null = null

/** Loads Google's map script once per page, with the browser key. */
function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  if (window.google?.maps) return Promise.resolve(window.google)
  loading ??= new Promise<GoogleMaps>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`
    script.async = true
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("Google Maps didn't load.")))
    script.onerror = () => {
      loading = null
      reject(new Error("Google Maps didn't load."))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * A Google map with pins (Tyler, 2 Nov 2026: Google Maps), for the trip's Map
 * tab (task part 42) and the places-visited map (task part 40). The map fits
 * itself to its pins. Without a browser map key it says what's missing
 * instead of drawing a blank box.
 */
export function GoogleMap({
  pins,
  onPick,
  className,
  emptyText,
}: {
  pins: MapPin[]
  onPick: (id: string) => void
  className?: string
  emptyText: string
}) {
  const { mapsKey, ready } = useTravelServices()
  const box = React.useRef<HTMLDivElement>(null)
  const [failed, setFailed] = React.useState(false)
  const onPickRef = React.useRef(onPick)
  React.useEffect(() => {
    onPickRef.current = onPick
  })
  const pinsJson = JSON.stringify(pins)

  React.useEffect(() => {
    if (!mapsKey || !box.current) return
    let alive = true
    const markers: { setMap: (map: unknown) => void }[] = []
    loadGoogleMaps(mapsKey)
      .then((google) => {
        if (!alive || !box.current) return
        const shown = JSON.parse(pinsJson) as MapPin[]
        const map = new google.maps.Map(box.current, {
          center: shown[0] ? { lat: shown[0].lat, lng: shown[0].lng } : { lat: 20, lng: 0 },
          zoom: shown.length ? 12 : 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        const bounds = new google.maps.LatLngBounds()
        for (const pin of shown) {
          const marker = new google.maps.Marker({
            map,
            position: { lat: pin.lat, lng: pin.lng },
            title: pin.title,
            label: pin.label ? { text: pin.label, color: "#ffffff", fontSize: "11px", fontWeight: "600" } : undefined,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: pin.color ?? "#2563eb",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          })
          marker.addListener("click", () => onPickRef.current(pin.id))
          markers.push(marker)
          bounds.extend({ lat: pin.lat, lng: pin.lng })
        }
        if (shown.length > 1) map.fitBounds(bounds, 48)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      for (const marker of markers) marker.setMap(null)
    }
  }, [mapsKey, pinsJson])

  if (ready && !mapsKey) {
    return (
      <div className={className}>
        <div className="grid h-full content-center justify-items-center gap-2 rounded-lg border bg-muted/40 p-6 text-center">
          <MapIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-72 text-sm text-muted-foreground">
            The map needs a Google Maps browser key. Add GOOGLE_MAPS_BROWSER_KEY to the app's settings.
          </p>
        </div>
      </div>
    )
  }
  if (failed) {
    return (
      <div className={className}>
        <p className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Google Maps didn't load. Check the browser key, then reload the page.
        </p>
      </div>
    )
  }
  return (
    <div className={className}>
      <div ref={box} className="size-full min-h-64 overflow-hidden rounded-lg border bg-muted/40" role="region" aria-label="Map" />
      {pins.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p> : null}
    </div>
  )
}
