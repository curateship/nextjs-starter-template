import * as React from "react"

/**
 * Pages that still open with no signal (docs/shell/offline-pages.md). An app
 * that wants its pages kept calls `useOfflinePages` on them with the path
 * starts to keep, such as `["/trips"]`, and the person signed in. Nothing in
 * the shell calls it, so an app that never does gets no worker and no change.
 *
 * The worker is `public/offline-worker.js`. It keeps a kept page and the data
 * and code it loads each time the page opens with signal, and uses them when
 * there is none. Telling it who is signed in lets it empty what it kept when
 * someone else signs in on the same phone.
 */
export function useOfflinePages(pages: readonly string[], userId: string) {
  const list = pages.join(",")
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || !list) return
    let alive = true
    navigator.serviceWorker
      .register(`/offline-worker.js?pages=${encodeURIComponent(list)}`, { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (alive) registration.active?.postMessage({ type: "signed-in", userId })
      })
      // A browser that refuses the worker (a private window, a blocked site) just has no offline pages.
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [list, userId])
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * Whether the browser has signal now, from its own online and offline events.
 * The server's draw always says yes, so a page never draws as offline before
 * it reaches the browser.
 */
export function useOnline() {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}
