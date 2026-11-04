import * as React from "react"

import {
  appNoticeDescription,
  appNotificationDetails,
  type AppNoticeDetail,
  type NoticeToLink,
} from "@/lib/app-options"
import { isOwnAppHref } from "@/lib/notification-action"

/**
 * What this app says about its own notices: the heading, figures and tile each
 * one is drawn with, and where it leads when it is clicked.
 *
 * **The look is worked out on the spot, and only the address is fetched.** The
 * shell is already holding the notice's own words, so an app that can read its
 * own sentences answers immediately through `describe` and every row is right
 * on the first paint. Putting the whole thing behind a request instead meant
 * drawing the plain sentence and redrawing it 378ms later, which read as the
 * old design flashing past.
 *
 * The fetched half is asked once per notice, when it first appears, rather
 * than when it is clicked. The database it comes from is a second away, and a
 * second of nothing between pressing a notice and the page moving reads as a
 * dead button. Asking while the tray is being read spends that second where
 * nobody is waiting on it.
 *
 * A notice is asked about exactly once, which `asked` is the whole record of.
 * Scrolling further back adds the new rows to the question and leaves the
 * answered ones alone, so a tray somebody has paged through four times has
 * made four small requests rather than four increasingly large ones.
 *
 * A failed request costs the addresses and nothing else: the rows keep
 * everything `describe` gave them and simply open nothing. The ids go back
 * into the pile, so the next page load asks again.
 */
export function useAppNotificationDetails(
  notices: readonly NoticeToLink[]
): Record<string, AppNoticeDetail> {
  const [fetched, setFetched] = React.useState<Record<string, AppNoticeDetail>>(
    {}
  )
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
    void appNotificationDetails(fresh)
      .then((found) => {
        if (!mounted.current) return
        const entries = Object.entries(found)
        if (entries.length === 0) return
        // The address is the one field that comes out of a database and is
        // then followed, so it is the one field checked. A detail whose
        // address points somewhere else keeps everything else it said and
        // simply stops being clickable.
        setFetched((current) => ({
          ...current,
          ...Object.fromEntries(
            entries.map(([id, detail]) => [
              id,
              detail.href && isOwnAppHref(detail.href)
                ? detail
                : { ...detail, href: undefined },
            ])
          ),
        }))
      })
      .catch(() => {
        for (const one of fresh) asked.current.delete(one.id)
      })
  }, [notices])

  return React.useMemo(() => {
    const drawn: Record<string, AppNoticeDetail> = {}
    for (const notice of notices) {
      const described = appNoticeDescription(notice)
      if (described) drawn[notice.id] = described
    }
    // Laid over, field by field. A fetched answer that says nothing about the
    // heading must not blank the heading `describe` already worked out, which
    // is exactly what spreading an object full of `undefined` would do.
    for (const [id, extra] of Object.entries(fetched)) {
      const defined = Object.fromEntries(
        Object.entries(extra).filter(([, value]) => value !== undefined)
      )
      drawn[id] = { ...drawn[id], ...defined }
    }
    return drawn
  }, [fetched, notices])
}
