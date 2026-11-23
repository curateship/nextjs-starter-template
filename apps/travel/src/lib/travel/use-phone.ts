import * as React from "react"

const PHONE_QUERY = "(max-width: 639px)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/**
 * Whether the window is phone-narrow, under 640px (task part 46). The server
 * can't know, so it draws the wider board, and the phone switches to one day
 * at a time once it has measured itself.
 */
export function usePhone() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}
