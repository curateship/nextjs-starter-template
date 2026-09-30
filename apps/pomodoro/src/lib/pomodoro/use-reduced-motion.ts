import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function readPreference() {
  return window.matchMedia(QUERY).matches
}

// The server cannot know the setting, so it renders as though motion is fine
// and the first client render corrects it. Claiming reduced motion on the
// server would show every visitor a still frame for one paint.
function serverPreference() {
  return false
}

/**
 * Whether this computer has asked for less movement on screen, and stays
 * current if the setting is changed while the app is open.
 *
 * macOS calls it Reduce Motion, Windows calls it Show animations, and both end
 * up in the same media query. `sound-engine.ts` reads the same query to decide
 * whether a sound fades or snaps; this is the same answer for anything drawn.
 */
export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(subscribe, readPreference, serverPreference)
}
