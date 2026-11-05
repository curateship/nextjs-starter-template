import { createFileRoute } from "@tanstack/react-router"

import { viralHello, viralHelloShape } from "@/server/viral-link/connect"
import { answerViral } from "@/server/viral-link/link"

/**
 * Test on Viral's Settings → Promo connection. The key is the guard
 * (`src/server/viral-link/link.ts`); the answer is whose Promo this is and
 * its projects, and Promo keeps Viral's address (`workspace/docs/viral-link.md`).
 */
export const Route = createFileRoute("/api/connect/viral/hello")({
  server: {
    handlers: {
      POST: ({ request }) => answerViral(request, viralHelloShape, (link, data) => viralHello(link, data)),
    },
  },
})
