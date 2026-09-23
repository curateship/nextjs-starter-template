import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { eventHasEnded, eventWhenLines } from "@/lib/events/event-time"
import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { visitorSite } from "@/server/directory/public"
import { readPublicEvent, type PublicEventPage } from "@/server/events/public"

/**
 * The public event page's door. It carries no guard, because a public page
 * that needs a session is not a public page; it is written down in
 * `src/app/open-endpoints.ts` with the reason.
 *
 * It checks the Events page's own switch before reading anything. The route
 * checks it too, but the route only decides what a browser draws, and anyone
 * can call this directly. A switched-off Events page, or a members-only one
 * asked for by somebody signed out, answers null, the same as an event that
 * does not exist.
 */

type PublicEventView = PublicEventPage & {
  ended: boolean
  /**
   * The page's two "when" lines, written here so the server and the browser
   * never name the time zone in two different ways.
   */
  when: { day: string; times: string }
}

const readEventFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<PublicEventView | null> => {
    const site = await visitorSite()
    if (!site) return null
    const visibility = await readPageVisibility(site.id, "/events")
    if (visibility === "off") return null
    if (visibility === "members") {
      const viewer = await findCurrentUser().catch(() => null)
      if (!viewer) return null
    }

    const page = await readPublicEvent(site, data.slug)
    if (!page) return null
    // Worked out on every request, after the cache, by the site's clock.
    return {
      ...page,
      ended: eventHasEnded(page.event, page.timeZone, new Date()),
      when: eventWhenLines(page.event, page.timeZone),
    }
  })

/** One published event by its address, or null if there is not one. */
export function loadEvent(slug: string) {
  return readEventFn({ data: { slug } })
}
