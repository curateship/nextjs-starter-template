import { createFileRoute } from "@tanstack/react-router"

import { answerViral } from "@/server/viral-link/link"
import { acceptRead, readShape } from "@/server/viral-link/reads"

/**
 * A read Viral asks for: X, LinkedIn or Reddit, run by Promo's own readers.
 * The key is the guard; the answer comes back to Viral when the read is done
 * (`src/server/viral-link/reads.ts`).
 */
export const Route = createFileRoute("/api/connect/viral/reads")({
  server: {
    handlers: {
      POST: ({ request }) => answerViral(request, readShape, (link, data) => acceptRead(link, data)),
    },
  },
})
