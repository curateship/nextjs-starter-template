import { createFileRoute } from "@tanstack/react-router"

import { handleEventSeatRequest } from "@/server/events/seat-link"

/**
 * The "Claim your seat" link from a waiting-list email.
 *
 * GET only, not signed in and not origin-checked: the unguessable token in the
 * address stands in for both, exactly as the directory's confirmation link
 * works. See `server/events/seat-link.ts`.
 */
export const Route = createFileRoute("/api/event-seat")({
  server: {
    handlers: {
      GET: ({ request }) => handleEventSeatRequest(request),
    },
  },
})
