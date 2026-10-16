import * as React from "react"

import { appUrlFromPersonalPath, parseAppUrl, personalPath } from "@/lib/menu"

type Screen = {
  /** The page the frame was told to load. */
  frameUrl: string | null
  /** Counts loads Personal asked for. It is the frame's key, so asking for the same page again still reloads it. */
  load: number
  /** Where the frame is now, which follows the app's own reports. */
  url: string | null
  title: string
}

function fromAddress(): Screen {
  const url = appUrlFromPersonalPath(window.location.pathname + window.location.search)
  return { frameUrl: url, load: 0, url, title: "" }
}

/**
 * The screen in the middle panel and Personal's address, kept in step.
 * Opening a link adds a history entry and loads the frame. A move inside the
 * frame only swaps Personal's address, so the frame never reloads under you,
 * and a reload of Personal lands on the same screen.
 */
export function useOpenScreen() {
  const [screen, setScreen] = React.useState(fromAddress)

  React.useEffect(() => {
    function onPopState() {
      const next = fromAddress()
      setScreen((current) =>
        next.url === current.url ? current : { ...next, load: current.load + 1 }
      )
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const open = React.useCallback((url: string) => {
    window.history.pushState(null, "", personalPath(url))
    setScreen((current) => ({ frameUrl: url, load: current.load + 1, url, title: "" }))
  }, [])

  /** The framed app says it moved to `path`. */
  const report = React.useCallback((path: string, title: string) => {
    setScreen((current) => {
      const base = current.url ? parseAppUrl(current.url) : null
      if (!base) return current
      const url = new URL(path, base.origin).href
      return url === current.url && title === current.title
        ? current
        : { ...current, url, title }
    })
  }, [])

  // Personal's address follows the frame. Opening a link and going Back have
  // already set it, so this only acts on a move made inside the frame.
  React.useEffect(() => {
    if (!screen.url) return
    const address = personalPath(screen.url)
    if (window.location.pathname + window.location.search !== address) {
      window.history.replaceState(null, "", address)
    }
  }, [screen.url])

  React.useEffect(() => {
    document.title = screen.title ? `${screen.title} · Personal` : "Personal"
  }, [screen.title])

  return { screen, open, report }
}
