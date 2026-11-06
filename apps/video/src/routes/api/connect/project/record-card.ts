import { createFileRoute } from "@tanstack/react-router"

import { recordCardResponse } from "@/server/video/project-record-card"

/**
 * Project asks here for one video project's name and picture, for the card in
 * a task's notes (`workspace/docs/project-guests.md`, "The card in Project's
 * notes"). No sign-in: the stamp made with the key the two apps share is the
 * guard, and the answer signs nobody in.
 */
export const Route = createFileRoute("/api/connect/project/record-card")({
  server: {
    handlers: {
      GET: ({ request }) => recordCardResponse(request),
    },
  },
})
