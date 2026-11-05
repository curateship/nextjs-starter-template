import { createFileRoute } from "@tanstack/react-router"

import { arrive, draftShape } from "@/server/video/viral-link/arrivals"
import { answerViral } from "@/server/video/viral-link/link"

/**
 * A send from Viral's Send to Video. The key is the guard; the draft is made
 * at once and the original is copied after the answer
 * (`src/server/video/viral-link/arrivals.ts`).
 */
export const Route = createFileRoute("/api/connect/viral/drafts")({
  server: {
    handlers: {
      POST: ({ request }) => answerViral(request, draftShape, (link, data) => arrive(link, data)),
    },
  },
})
