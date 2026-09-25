import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { ListingCard } from "@/components/directory/public/listing-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { PublicMapPin } from "@/lib/api/directory/public"
import {
  directoryMapCapNotice,
  directoryMapCentre,
} from "@/lib/directory/listing-map"
import {
  loadGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
} from "@/lib/directory/google-maps"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The browse page's results as pins.
 *
 * The same listings as the grid, drawn on a map, with the same card behind
 * each pin. Three things it deliberately does not do: it does not page (the
 * cap is said out loud instead), it does not draw a listing with no
 * coordinates, and it does not fall back to an empty grey square when there is
 * nothing to plot.
 */
export function ListingMap({
  apiKey,
  pins,
  total,
}: {
  apiKey: string
  pins: PublicMapPin[]
  /** Matching listings that have a location, before the cap. */
  total: number
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<GoogleMap | null>(null)
  const markersRef = React.useRef<GoogleMarker[]>([])
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  const closeRef = React.useRef<HTMLButtonElement | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  /*
   * The open card, and the pins it was opened on.
   *
   * Both, because a new search means a new map: the card from the old results
   * is stale even when its listing happens to still be among the new ones. The
   * pair is compared while drawing rather than cleared in an effect, so there
   * is no render where the page shows a card it has already decided is wrong.
   */
  const [selection, setSelection] = React.useState<{
    pins: PublicMapPin[]
    id: string
  } | null>(null)
  const selectedId = selection?.pins === pins ? selection.id : null

  const notice = directoryMapCapNotice(pins.length, total)
  const selected = pins.find((pin) => pin.id === selectedId) ?? null

  const open = React.useCallback(
    (id: string) => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setSelection({ pins, id })
    },
    [pins]
  )

  const close = React.useCallback(() => {
    setSelection(null)
    // Whatever opened the card, or the map itself. Without the fallback a card
    // opened by clicking a pin closes with focus on a button that is about to
    // be removed, and a keyboard visitor is dropped back at the top of the
    // page with no idea where they were.
    const back = returnFocusRef.current
    if (back?.isConnected) back.focus()
    else containerRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (pins.length === 0) return
    let cancelled = false

    async function draw() {
      // Nothing to draw into. This is also what stops a failed load being
      // retried on every search: the failure message replaces the container,
      // so the next attempt stops here instead of fetching Google again.
      if (!containerRef.current) return

      let maps
      try {
        maps = await loadGoogleMaps(apiKey)
      } catch {
        if (!cancelled) setFailed(true)
        return
      }
      const container = containerRef.current
      if (cancelled || !container) return

      if (!mapRef.current) {
        const centre = directoryMapCentre(pins)
        mapRef.current = new maps.Map(container, {
          center: { lat: centre?.latitude ?? 0, lng: centre?.longitude ?? 0 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          // Google's own points of interest are not this site's listings, and a
          // visitor clicking one gets a Google card instead of a listing.
          clickableIcons: false,
        })
      }
      const map = mapRef.current

      for (const marker of markersRef.current) marker.setMap(null)
      const bounds = new maps.LatLngBounds()
      markersRef.current = pins.map((pin) => {
        const position = { lat: pin.latitude, lng: pin.longitude }
        bounds.extend(position)
        const marker = new maps.Marker({
          position,
          map,
          title: pin.title,
          clickable: true,
        })
        marker.addListener("click", () => open(pin.id))
        return marker
      })

      if (pins.length === 1) {
        map.setCenter(bounds.getCenter())
        map.setZoom(14)
      } else {
        map.fitBounds(bounds, 48)
        // Pins on top of each other would otherwise zoom to the pavement.
        maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > 15) map.setZoom(15)
        })
      }
      setReady(true)
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [apiKey, pins, open])

  // Markers belong to Google's map, not to React, so they are taken off by
  // hand when this leaves the page.
  React.useEffect(
    () => () => {
      for (const marker of markersRef.current) marker.setMap(null)
      markersRef.current = []
      mapRef.current = null
    },
    []
  )

  React.useEffect(() => {
    if (!selectedId) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedId, close])

  if (pins.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            None of these listings have a location yet, so there is nothing to
            put on a map. Switch back to the grid to see them.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (failed) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            The map could not be loaded. Switch back to the grid, or try again
            in a moment.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}

      {/* `overflow-hidden` and a width that is only ever its parent's: a map
          library that measures its own container must never be the reason a
          phone scrolls sideways. */}
      <div className="relative w-full overflow-hidden rounded-lg border">
        <div
          ref={containerRef}
          role="region"
          aria-label="Map of listings"
          // Focusable only on purpose, never by tabbing: it is somewhere to put
          // focus when a card closes and there is nowhere else to send it.
          tabIndex={-1}
          className="h-[380px] w-full focus:outline-none md:h-[560px]"
        />

        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {/*
         * The same pins as buttons.
         *
         * Google's markers can be tabbed to, but a map is a picture and a
         * keyboard visitor should not have to take that on trust. Each button
         * becomes visible the moment it is focused, so focus is never in a
         * place nobody can see, and pressing it opens exactly the card the
         * pin opens.
         */}
        {/* A plain wrapper, not a list: every button inside is `sr-only`,
            which takes it out of the flow, so this element has no height and
            nothing to position against of its own. */}
        <div role="group" aria-label="Listings on this map">
          {pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={() => open(pin.id)}
              className={`sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:inline-flex focus:h-8 focus:items-center focus:rounded-md focus:border focus:bg-card focus:px-3 focus:text-sm ${focusRing}`}
            >
              {pin.title}
            </button>
          ))}
        </div>

        {selected ? (
          <div className="absolute bottom-2 left-2 z-10 w-[min(20rem,calc(100%-1rem))]">
            <ListingCard listing={selected} />
            <Button
              ref={closeRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Close ${selected.title}`}
              onClick={close}
              className="absolute top-1 right-1 z-10 bg-card/90"
            >
              <XIcon />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
