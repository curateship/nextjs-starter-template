import { createFileRoute } from "@tanstack/react-router"

import { visitorSite } from "@/server/directory/public"
import { siteCalendarFeedResponse } from "@/server/events/calendar"

/** The site's calendar subscription: every published event not over yet. */
export const Route = createFileRoute("/events.ics")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return await siteCalendarFeedResponse({ site: await visitorSite() })
        } catch (error) {
          console.error("Events calendar feed failed", error)
          return new Response("The calendar is unavailable right now.", {
            status: 503,
          })
        }
      },
    },
  },
})
