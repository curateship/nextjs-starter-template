import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { visitorSite } from "@/server/directory/public"
import { eventCalendarFileResponse } from "@/server/events/calendar"

/** One published event as a file Apple Calendar and Outlook open. */
export const Route = createFileRoute("/events_/$slug/calendar.ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await eventCalendarFileResponse({
            site: await visitorSite(),
            slug: params.slug,
            isSignedIn: async () =>
              Boolean(await findCurrentUser().catch(() => null)),
          })
        } catch (error) {
          console.error("Event calendar file failed", error)
          return new Response("The calendar file is unavailable right now.", {
            status: 503,
          })
        }
      },
    },
  },
})
