import * as React from "react"
import { useRouter } from "@tanstack/react-router"

/**
 * Sends one tiny "a page was viewed" ping per navigation to
 * /api/v1/traffic/view. Mounted once, in the root component, so every page —
 * public and signed-in alike — reports itself.
 *
 * The ref of the last-sent pathname is what keeps it to one ping: the mount
 * send and the router's first onResolved would otherwise both fire for the
 * initial page (and StrictMode would double the mount), and a query-only
 * change resolves without the page changing. The server filters bots,
 * admins, and the admin area on its own — skipping /admin here just saves
 * the request.
 */
export function useTrafficBeacon() {
  const router = useRouter()
  const lastSentPath = React.useRef<string | null>(null)

  React.useEffect(() => {
    const send = (path: string) => {
      if (path === lastSentPath.current) return
      if (path === "/admin" || path.startsWith("/admin/")) return
      const firstSend = lastSentPath.current === null
      lastSentPath.current = path

      const body = JSON.stringify({
        path,
        // Only the landing page has an outside referrer; every navigation
        // after it would just report this site to itself.
        ...(firstSend && document.referrer
          ? { referrer: document.referrer }
          : {}),
      })

      // sendBeacon survives the tab closing mid-send; keepalive is the
      // fallback where it's missing or refuses the payload.
      const sent = navigator.sendBeacon?.(
        "/api/v1/traffic/view",
        new Blob([body], { type: "application/json" })
      )
      if (!sent) {
        void fetch("/api/v1/traffic/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {})
      }
    }

    send(window.location.pathname)
    return router.subscribe("onResolved", (event) => {
      send(event.toLocation.pathname)
    })
  }, [router])
}
