import { createFileRoute } from "@tanstack/react-router"

import { calendarFeedFor } from "@/server/fitness/calendar-feed"

/**
 * The calendar feed Google Calendar and Apple Calendar subscribe to. The
 * secret in the address is the only key, so a wrong or reset one gets a 404
 * that says nothing about whether it ever existed.
 */
export const Route = createFileRoute("/api/fitness/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const feed = await calendarFeedFor(params.token)
        if (!feed) return new Response("Not found", { status: 404 })
        return new Response(feed, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, max-age=300",
          },
        })
      },
    },
  },
})
