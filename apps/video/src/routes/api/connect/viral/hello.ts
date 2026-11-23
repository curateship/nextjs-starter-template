import { createFileRoute } from "@tanstack/react-router"

import { hello, helloShape } from "@/server/video/viral-link/arrivals"
import { answerViral } from "@/server/video/viral-link/link"

/**
 * Test on Viral's Settings → Video connection. The key made on Settings →
 * Viral is the guard; the answer is whose Video this is and its projects,
 * and Video keeps Viral's address (`workspace/docs/viral-connection.md`).
 */
export const Route = createFileRoute("/api/connect/viral/hello")({
  server: {
    handlers: {
      POST: ({ request }) => answerViral(request, helloShape, (link, data) => hello(link, data)),
    },
  },
})
