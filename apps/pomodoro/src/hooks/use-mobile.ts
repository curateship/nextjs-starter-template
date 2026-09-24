import * as React from "react"

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Starts listening for the window crossing the phone/desktop line, and hands
 * back the function that stops listening.
 *
 * Declared out here rather than inside the hook so it is the same function on
 * every render — React starts listening again whenever this changes, and one
 * written inside would be a new function each time.
 */
function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function isNarrow() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** What to answer while the page is being built on the server, where there is
 * no window to measure. Same as the old starting value. */
function assumeDesktop() {
  return false
}

/**
 * Whether the window is phone-width.
 *
 * `useSyncExternalStore` is React's way of reading something that lives
 * outside React — here, the window's own width. This used to be a piece of
 * state written from an effect, which meant every page drew once assuming a
 * desktop and then drew again to correct itself. On a phone that is a visible
 * flicker, on every page, on every load.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, isNarrow, assumeDesktop)
}
