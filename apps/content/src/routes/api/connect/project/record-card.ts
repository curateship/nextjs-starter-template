import { createFileRoute } from "@tanstack/react-router"

import { contentRecordCardResponse } from "@/server/content-app/project-handoff"

/**
 * Project asks here for one project's name and picture, for the card in a
 * task's notes: a video project's for "Edit video"
 * (`workspace/docs/video-project-guests.md`, "The card in Project's notes") or
 * a project's for "Open in Promo" (`workspace/docs/project-guests.md`). No
 * sign-in: the stamp made with the key the two apps share is the guard, and
 * the answer signs nobody in.
 */
export const Route = createFileRoute("/api/connect/project/record-card")({
  server: {
    handlers: {
      GET: ({ request }) => contentRecordCardResponse(request),
    },
  },
})
