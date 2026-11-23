import { createFileRoute } from "@tanstack/react-router"

import { arrivalShape } from "@/server/archive/arrivals"
import { arrive } from "@/server/archive/connect"
import { answerVideo } from "@/server/archive/video-link"

/**
 * A send from Video's Send to Promo. The key is the guard; the item is made
 * at once and its files are copied after the answer
 * (`src/server/archive/arrivals.ts`).
 */
export const Route = createFileRoute("/api/connect/video/items")({
  server: {
    handlers: {
      POST: ({ request }) => answerVideo(request, arrivalShape, (link, data) => arrive(link, data)),
    },
  },
})
