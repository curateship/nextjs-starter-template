import * as React from "react"

/**
 * How the middle panel draws its screen: a zoom, and a phone-size view. Both
 * are kept by this browser, one for every screen. Tyler chose one zoom kept by
 * the browser on 17 Oct 2026. Storage can be blocked (a private window), and
 * then a choice lasts until the page reloads.
 */

export const PANEL_ZOOMS = [1, 0.9, 0.8, 0.67] as const
export type PanelZoom = (typeof PANEL_ZOOMS)[number]

/** The width a phone shows a page at, in pixels. */
export const PHONE_WIDTH = 390

const ZOOM_KEY = "personal-panel-zoom"
const PHONE_KEY = "personal-panel-phone"

function read(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

export function zoomLabel(zoom: PanelZoom) {
  return `${Math.round(zoom * 100)}%`
}

export function usePanelView() {
  const [zoom, setZoomState] = React.useState<PanelZoom>(
    () => PANEL_ZOOMS.find((z) => String(z) === read(ZOOM_KEY)) ?? 1
  )
  const [phone, setPhoneState] = React.useState(() => read(PHONE_KEY) === "on")

  const setZoom = React.useCallback((next: PanelZoom) => {
    setZoomState(next)
    write(ZOOM_KEY, String(next))
  }, [])

  const setPhone = React.useCallback((next: boolean) => {
    setPhoneState(next)
    write(PHONE_KEY, next ? "on" : "off")
  }, [])

  return { zoom, setZoom, phone, setPhone }
}
