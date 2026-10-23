import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/events.ics/route"

export const Route = createFileRoute("/events.ics")({
  server: {
    handlers: {
      GET: () => GET(),
    },
  },
})
