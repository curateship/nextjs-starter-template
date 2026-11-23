import { createFileRoute } from "@tanstack/react-router"

import { handoffResponse } from "@/server/social/project-handoff"

/**
 * Where Project sends somebody who pressed "Open in Promo" on a task, with a
 * stamped note in `?note=` (`workspace/docs/project-guests.md`). No sign-in:
 * the note is the guard. It works once within 60 seconds, so a copied
 * address is refused, and the browser is sent on with the note gone from
 * the address bar.
 */
export const Route = createFileRoute("/handoff/project")({
  server: {
    handlers: {
      GET: ({ request }) => handoffResponse(request),
    },
  },
})
