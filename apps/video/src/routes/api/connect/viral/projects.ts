import { createFileRoute } from "@tanstack/react-router"

import { projects } from "@/server/video/viral-link/arrivals"
import { answerViral } from "@/server/video/viral-link/link"

/** The Video projects Viral's Send to Video lists. The key is the guard (`workspace/docs/viral-connection.md`). */
export const Route = createFileRoute("/api/connect/viral/projects")({
  server: {
    handlers: {
      GET: ({ request }) => answerViral(request, null, (link) => projects(link)),
    },
  },
})
