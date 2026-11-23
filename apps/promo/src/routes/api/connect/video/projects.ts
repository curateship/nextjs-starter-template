import { createFileRoute } from "@tanstack/react-router"

import { projects } from "@/server/archive/connect"
import { answerVideo } from "@/server/archive/video-link"

/** The Promo projects Video's send window lists. The key is the guard. */
export const Route = createFileRoute("/api/connect/video/projects")({
  server: {
    handlers: {
      GET: ({ request }) => answerVideo(request, null, (link) => projects(link)),
    },
  },
})
