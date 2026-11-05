import { createFileRoute } from "@tanstack/react-router"

import { answerViral } from "@/server/viral-link/link"
import { acceptPost, postShape } from "@/server/viral-link/posts"

/**
 * A post Viral wrote, left as a draft in a Promo project. The key is the
 * guard; nothing is posted until somebody presses Post in Promo
 * (`src/server/viral-link/posts.ts`).
 */
export const Route = createFileRoute("/api/connect/viral/posts")({
  server: {
    handlers: {
      POST: ({ request }) => answerViral(request, postShape, (link, data) => acceptPost(link, data)),
    },
  },
})
