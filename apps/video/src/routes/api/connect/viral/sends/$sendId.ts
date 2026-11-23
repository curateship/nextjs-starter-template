import { createFileRoute } from "@tanstack/react-router"

import { sendStatus } from "@/server/video/viral-link/arrivals"
import { answerViral } from "@/server/video/viral-link/link"

/** Where one send from Viral stands. The key is the guard, and only the key's own sends answer. */
export const Route = createFileRoute("/api/connect/viral/sends/$sendId")({
  server: {
    handlers: {
      GET: ({ request, params }) => answerViral(request, null, (link) => sendStatus(link, params.sendId.slice(0, 64))),
    },
  },
})
