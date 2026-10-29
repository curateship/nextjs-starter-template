import * as React from "react"

/**
 * Light, dark, or the Mac's own setting, picked in the cog and kept by this
 * browser. Tyler asked for the choice on 28 Oct 2026; until then Personal
 * always followed the Mac. It is read before the first paint (`main.tsx`), so
 * a dark pick never flashes light. It changes Personal itself, never the app
 * in the middle panel, which keeps its own look. Storage can be blocked (a
 * private window), and then a pick lasts until the page reloads.
 */

const COLOUR_MODES = ["light", "dark", "system"] as const
export type ColourMode = (typeof COLOUR_MODES)[number]

const KEY = "personal-colour-mode"

/** This browser's pick, or "system" with none saved. */
export function savedColourMode(): ColourMode {
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(KEY)
  } catch {
    // Blocked storage reads as no pick.
  }
  return COLOUR_MODES.find((mode) => mode === saved) ?? "system"
}

/** Whether a mode draws dark, given whether the Mac is set to dark. */
export function isDark(mode: ColourMode, macDark: boolean) {
  return mode === "dark" || (mode === "system" && macDark)
}

const macDark = () => window.matchMedia("(prefers-color-scheme: dark)")
let current: ColourMode = "system"

function paint() {
  document.documentElement.classList.toggle("dark", isDark(current, macDark().matches))
}

/** Paints the saved pick and follows the Mac live while it is "system". Run once, before rendering. */
export function startColourMode() {
  current = savedColourMode()
  paint()
  macDark().addEventListener("change", paint)
}

export function useColourMode() {
  const [mode, setModeState] = React.useState<ColourMode>(savedColourMode)

  const setMode = React.useCallback((next: ColourMode) => {
    setModeState(next)
    current = next
    paint()
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      // Blocked storage: the pick lasts until the page reloads.
    }
  }, [])

  return { mode, setMode }
}
