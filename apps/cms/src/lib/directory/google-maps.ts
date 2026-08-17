/**
 * Loading Google Maps in the browser, and the small part of its shape this app
 * actually touches.
 *
 * The types are written out here rather than pulled from `@types/google.maps`
 * on purpose: `package.json` is a shell file, and an app that edits one has
 * forked the shell and will conflict on every future merge. Ten lines of
 * interface is a much smaller price than that, and it keeps the surface this
 * app depends on visible in one place.
 */

export type MapPoint = { lat: number; lng: number }

export type GoogleBounds = {
  extend(point: MapPoint): void
  getCenter(): MapPoint
}

export type GoogleMap = {
  setCenter(point: MapPoint): void
  setZoom(zoom: number): void
  getZoom(): number | undefined
  fitBounds(bounds: GoogleBounds, padding?: number): void
}

export type GoogleMarker = {
  setMap(map: GoogleMap | null): void
  addListener(event: string, handler: () => void): { remove(): void }
}

export type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: MapPoint
      zoom: number
      mapTypeControl?: boolean
      streetViewControl?: boolean
      fullscreenControl?: boolean
      clickableIcons?: boolean
    }
  ) => GoogleMap
  Marker: new (options: {
    position: MapPoint
    map?: GoogleMap
    title?: string
    clickable?: boolean
  }) => GoogleMarker
  LatLngBounds: new () => GoogleBounds
  event: {
    addListenerOnce(
      instance: GoogleMap,
      event: string,
      handler: () => void
    ): void
  }
}

type MapsWindow = Window & {
  google?: { maps?: GoogleMapsApi }
  [callback: string]: unknown
}

const READY_CALLBACK = "__cmsDirectoryMapReady"
const LOAD_TIMEOUT_MS = 15_000

/**
 * One load per page, shared by everything that asks.
 *
 * Google's script can only be put on a page once, so a second call while the
 * first is still in flight waits on the same promise rather than adding a
 * second `<script>` — which is what produces its "included multiple times"
 * console error.
 */
let loading: Promise<GoogleMapsApi> | null = null

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps needs a browser."))
  }

  const maps = (window as unknown as MapsWindow).google?.maps
  if (maps) return Promise.resolve(maps)
  if (loading) return loading

  loading = new Promise<GoogleMapsApi>((resolve, reject) => {
    const scope = window as unknown as MapsWindow
    const script = document.createElement("script")
    let settled = false
    const timer = window.setTimeout(() => {
      fail(new Error("Google Maps took too long to load."))
    }, LOAD_TIMEOUT_MS)

    function fail(error: Error) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      // Forgotten so a later visit to the map can try again rather than being
      // stuck on one bad network moment for the life of the tab.
      loading = null
      script.remove()
      reject(error)
    }

    /*
     * Google's async loader wants a callback rather than the script's own load
     * event; using the load event instead is what makes it print a performance
     * warning to the console.
     *
     * The callback is left in place after a failure rather than deleted. A
     * script that was already fetched still runs even once its tag is removed,
     * and it calls this name — so deleting it turns a slow network into
     * "undefined is not a function" in a visitor's console.
     */
    scope[READY_CALLBACK] = () => {
      if (settled) return
      const ready = scope.google?.maps
      if (!ready) {
        fail(new Error("Google Maps loaded without its map library."))
        return
      }
      settled = true
      window.clearTimeout(timer)
      resolve(ready)
    }

    const parameters = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      callback: READY_CALLBACK,
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`
    script.async = true
    script.onerror = () => fail(new Error("Google Maps could not be loaded."))
    document.head.appendChild(script)
  })

  return loading
}
