import * as React from "react"

import { readGuestJson, writeGuestJson } from "@/lib/pomodoro/guest-storage"

/**
 * How dark the dark mode is. The old app had one near-black canvas, which is
 * hard on the eyes for a long focus, so the member screens carry four grey
 * steps instead. The colours themselves live in theme.css, keyed off a
 * `data-dark-shade` attribute on <html>; this module only remembers the
 * choice and puts the attribute there.
 *
 * The choice belongs to the browser, like the light/dark switch next to it
 * (the shell keeps that in localStorage under "theme"), so it is one key in
 * guest storage rather than a saved row, and a guest keeps it too.
 */

const DARK_SHADE_KEY = "pomodoro:dark-shade:v1"

export const DARK_SHADES = [
  {
    id: "black",
    label: "Near black",
    help: "The original: almost no light in the canvas.",
    swatch: "#0b0b0e",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    help: "A step up, still clearly dark.",
    swatch: "#17171a",
  },
  {
    id: "graphite",
    label: "Graphite",
    help: "Mid grey. Easiest on the eyes for long sessions.",
    swatch: "#212125",
  },
  {
    id: "ash",
    label: "Soft grey",
    help: "The lightest dark mode, closest to a grey paper.",
    swatch: "#2b2b31",
  },
] as const

export type DarkShadeId = (typeof DARK_SHADES)[number]["id"]

export const DEFAULT_DARK_SHADE: DarkShadeId = "graphite"

export function isDarkShadeId(value: unknown): value is DarkShadeId {
  return DARK_SHADES.some((shade) => shade.id === value)
}

export function darkShade(id: DarkShadeId) {
  return DARK_SHADES.find((shade) => shade.id === id) ?? DARK_SHADES[0]
}

let state: DarkShadeId = DEFAULT_DARK_SHADE
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function paint() {
  if (typeof document === "undefined") return
  document.documentElement.dataset.darkShade = state
}

/** Reads the stored choice and puts it on <html>. Runs once, on import. */
function ensureDarkShade() {
  if (typeof window === "undefined") return
  const stored = readGuestJson<string>(DARK_SHADE_KEY)
  state = isDarkShadeId(stored) ? stored : DEFAULT_DARK_SHADE
  paint()
}

export function chooseDarkShade(id: DarkShadeId) {
  state = id
  paint()
  writeGuestJson(DARK_SHADE_KEY, id)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDarkShade() {
  const shade = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => DEFAULT_DARK_SHADE
  )
  return { shade, chooseDarkShade }
}

// On import, before the shell's first paint, so the canvas never flashes
// near black on the way to the chosen shade. The product shell imports this
// module for that effect, which is why every member screen carries it.
ensureDarkShade()
