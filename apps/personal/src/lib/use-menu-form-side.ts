import * as React from "react"

/** The width the left menu stops sitting beside the page and opens over it: Tailwind's `md`. */
const WIDE = "(min-width: 768px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/**
 * Whether the menu sits in its own column beside the page, from 768 pixels
 * wide. Drawn outside a browser, as the tests do, it counts as wide.
 */
export function useWideScreen() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true
  )
}

/**
 * Where the menu's pop-up forms open from the item that opened them. Beside
 * the menu they open to its right. On a phone the menu takes most of the
 * width, so a form to its right runs off the screen; below it, the pop-up
 * slides sideways to stay on screen.
 */
export function useMenuFormSide() {
  return useWideScreen() ? "right" : "bottom"
}
