import * as React from "react"

/**
 * Whether this tab is the one on screen. True on the server and on the first
 * render, so the server and the browser draw the same thing, then it follows
 * the browser's own `visibilitychange`.
 */
export function usePageVisible() {
  return React.useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => true
  )
}

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}
