import * as React from "react"

/** The width the left menu stops sitting beside the page and opens over it: Tailwind's `md`. */
const WIDE = "(min-width: 768px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/**
 * Where the menu's pop-up forms open from the item that opened them. Beside
 * the menu they open to its right. On a phone the menu takes most of the
 * width, so a form to its right runs off the screen; below it, the pop-up
 * slides sideways to stay on screen.
 */
export function useMenuFormSide() {
  const wide = React.useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches)
  return wide ? "right" : "bottom"
}
