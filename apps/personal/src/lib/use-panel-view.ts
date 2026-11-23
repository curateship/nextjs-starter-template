import * as React from "react"

import { DEFAULT_KEPT_FRAMES, KEPT_FRAME_CHOICES } from "@/lib/frames"

/**
 * How the middle panel draws its screen: a zoom, a phone-size view, and how
 * many screens stay loaded. All are kept by this browser, one for every screen.
 * Tyler chose one zoom kept by the browser on 17 Oct 2026. Storage can be blocked (a private window), and
 * then a choice lasts until the page reloads.
 */

export const PANEL_ZOOMS = [1, 0.9, 0.8, 0.67] as const
export type PanelZoom = (typeof PANEL_ZOOMS)[number]

/** The width a phone shows a page at, in pixels. */
export const PHONE_WIDTH = 390

const ZOOM_KEY = "personal-panel-zoom"
const PHONE_KEY = "personal-panel-phone"
const KEPT_KEY = "personal-panel-kept"

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
  const [kept, setKeptState] = React.useState<number>(
    () => KEPT_FRAME_CHOICES.find((n) => String(n) === read(KEPT_KEY)) ?? DEFAULT_KEPT_FRAMES
  )

  const setZoom = React.useCallback((next: PanelZoom) => {
    setZoomState(next)
    write(ZOOM_KEY, String(next))
  }, [])

  const setPhone = React.useCallback((next: boolean) => {
    setPhoneState(next)
    write(PHONE_KEY, next ? "on" : "off")
  }, [])

  const setKept = React.useCallback((next: number) => {
    setKeptState(next)
    write(KEPT_KEY, String(next))
  }, [])

  return { zoom, setZoom, phone, setPhone, kept, setKept }
}
