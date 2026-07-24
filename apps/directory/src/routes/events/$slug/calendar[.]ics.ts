import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/events/[slug]/calendar.ics/route"

export const Route = createFileRoute("/events/$slug/calendar.ics")({
  server: {
    handlers: {
      GET: ({ params }) => GET({ params: Promise.resolve({ slug: params.slug }) }),
    },
  },
})
