import * as React from "react"

import { appNotificationLinks, type NoticeToLink } from "@/lib/app-options"
import { isOwnAppHref } from "@/lib/notification-action"

/**
 * Where this app's own notices lead, for the notices currently on screen.
 *
 * Asked once per notice, when it first appears, rather than when it is
 * clicked. The database this answer comes from is a second away, and a second
 * of nothing between pressing a notice and the page moving reads as a dead
 * button. Asking while the tray is being read spends that second where nobody
 * is waiting on it.
 *
 * A notice is asked about exactly once, which `asked` is the whole record of.
 * Scrolling further back adds the new rows to the question and leaves the
 * answered ones alone, so a tray somebody has paged through four times has
 * made four small requests rather than four increasingly large ones.
 *
 * The list handed in is a piece of state, so it keeps the same identity until
 * it actually changes and the effect below runs only when it does. `asked` is
 * belt as well as braces: it is what stops a list that changed for some other
 * reason — one notice marked read — from asking again about the other
 * nineteen.
 *
 * A failed request means those notices open nothing, which is what every one
 * of them did before this existed — so it says nothing on screen. The ids go
 * back into the pile, so the next page load asks again.
 */
export function useAppNotificationLinks(
  notices: readonly NoticeToLink[]
): Record<string, string> {
  const [links, setLinks] = React.useState<Record<string, string>>({})
  const asked = React.useRef<Set<string>>(new Set())
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  React.useEffect(() => {
    const fresh = notices.filter((one) => !asked.current.has(one.id))
    if (fresh.length === 0) return
    for (const one of fresh) asked.current.add(one.id)

    // Deliberately nothing cancelled when this runs again. A second page
    // landing while the first page's answer is still in the air would
    // otherwise throw that answer away with its ids already marked as asked,
    // and those notices would never get their address.
    void appNotificationLinks(fresh)
      .then((found) => {
        if (!mounted.current) return
        const safe = Object.entries(found).filter(([, href]) =>
          isOwnAppHref(href)
        )
        if (safe.length === 0) return
        setLinks((current) => ({ ...current, ...Object.fromEntries(safe) }))
      })
      .catch(() => {
        for (const one of fresh) asked.current.delete(one.id)
      })
  }, [notices])

  return links
}
