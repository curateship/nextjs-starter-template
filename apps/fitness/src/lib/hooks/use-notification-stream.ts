import * as React from "react"

/**
 * Keeps one browser tab up to date with the bell.
 *
 * The tab holds a connection open to `/api/v1/notifications/stream` and calls
 * `onSync` whenever the server says there is something new. Three things call
 * it, and the order matters more than any of them on its own:
 *
 * 1. **A nudge**, debounced — several notices landing together are one check.
 * 2. **Every time the connection opens**, not only when a message arrives.
 *    A notice written while the connection was down was announced to nobody,
 *    and no second announcement is ever coming for it; asking on every open —
 *    first connect, reconnect, and coming back to a tab that was hidden — is
 *    what closes that gap.
 * 3. **A slow check every minute**, which is the floor under all of it. If the
 *    stream is switched off, or something in front of the server quietly
 *    swallows it, the bell is a minute late rather than wrong forever.
 *
 * The stream is dropped while the tab is hidden and opened again when it is
 * shown. A browser only allows about six connections to one site at a time
 * over the older protocol, and an open stream sits on one of them for as long
 * as it is open — so six tabs of this app and the seventh request of any kind,
 * including an ordinary page load, waits in line behind them. Production
 * multiplexes and does not have this problem; local development does, and it
 * would get blamed on something else. Keeping the stream to the tab actually
 * being looked at fixes it either way, and means ten open tabs no longer make
 * ten trips to the server for the same piece of news.
 */

const STREAM_PATH = "/api/v1/notifications/stream"

/** A burst of notices at once should be one check, not one each. */
const NUDGE_DEBOUNCE_MS = 300

/** The fallback. Deliberately slow — it is the safety net, not the mechanism. */
const FALLBACK_POLL_MS = 60_000

export function useNotificationStream({
  live,
  onSync,
}: {
  /** The app-wide switch. Off, no connection is opened at all. */
  live: boolean
  onSync: () => void
}) {
  // Held in a ref so a caller that rebuilds this callback every render does
  // not tear the connection down and open a new one every render with it.
  const onSyncRef = React.useRef(onSync)
  React.useEffect(() => {
    onSyncRef.current = onSync
  }, [onSync])

  React.useEffect(() => {
    let source: EventSource | null = null
    let debounce: ReturnType<typeof setTimeout> | null = null

    const sync = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        onSyncRef.current()
      }, NUDGE_DEBOUNCE_MS)
    }

    const closeStream = () => {
      source?.close()
      source = null
    }

    const openStream = () => {
      if (!live || source) return
      if (document.visibilityState !== "visible") return

      const opened = new EventSource(STREAM_PATH)
      source = opened
      opened.onopen = sync
      opened.onmessage = sync
      opened.onerror = () => {
        // A dropped stream is the browser's own job — it waits and reconnects,
        // and the `onopen` above then catches up on the gap. This only handles
        // the other case: a request that was refused outright (signed out, or
        // the switch turned off), where the browser gives up for good. Letting
        // go of the handle means showing the tab again can try afresh.
        if (opened.readyState === EventSource.CLOSED && source === opened) {
          source = null
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        openStream()
        // Asked for whether or not a stream opened — with the switch off this
        // is the only thing that catches a hidden tab up.
        sync()
        return
      }
      closeStream()
    }

    openStream()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const poll = setInterval(() => {
      // No point checking on behalf of a tab nobody is looking at; showing it
      // again checks straight away.
      if (document.visibilityState === "visible") sync()
    }, FALLBACK_POLL_MS)

    return () => {
      clearInterval(poll)
      if (debounce) clearTimeout(debounce)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      closeStream()
    }
  }, [live])
}
