import { createFileRoute } from "@tanstack/react-router"

import { loadCalendarFeed } from "@/server/travel/calendar"

/**
 * A trip's calendar, for Apple and Google Calendar to subscribe to (task part
 * 45). Nobody signs in here: the long secret in the address stands in for a
 * sign-in, the way the unsubscribe link's signature does. A wrong secret gets
 * a bare 404, so the answer never says whether a trip is there.
 *
 * The address has no ".ics" on the end on purpose. The dev server is known
 * to answer 404 to an app route ending ".svg", so the address carries no
 * extension at all. Calendar apps read the Content-Type, not the name.
 */
export const Route = createFileRoute("/api/travel/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const calendar = await loadCalendarFeed(params.token)
        if (calendar === null) return new Response("Not found", { status: 404 })
        return new Response(calendar, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="trip.ics"',
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
    },
  },
})
