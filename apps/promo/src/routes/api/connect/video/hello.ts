import { createFileRoute } from "@tanstack/react-router"

import { hello, helloShape } from "@/server/archive/connect"
import { answerVideo } from "@/server/archive/video-link"

/**
 * Test on Video's Settings → Promo. The key is the guard
 * (`src/server/archive/video-link.ts`); the answer is whose Promo this is and
 * its projects, and Promo keeps Video's address (`workspace/docs/archive.md`).
 */
export const Route = createFileRoute("/api/connect/video/hello")({
  server: {
    handlers: {
      POST: ({ request }) => answerVideo(request, helloShape, (link, data) => hello(link, data)),
    },
  },
})
