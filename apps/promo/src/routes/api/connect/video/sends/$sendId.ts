import { createFileRoute } from "@tanstack/react-router"

import { sendStatus } from "@/server/archive/connect"
import { answerVideo } from "@/server/archive/video-link"

/** Where one send from Video stands. The key is the guard, and only the key's own sends answer. */
export const Route = createFileRoute("/api/connect/video/sends/$sendId")({
  server: {
    handlers: {
      GET: ({ request, params }) => answerVideo(request, null, (link) => sendStatus(link, params.sendId.slice(0, 64))),
    },
  },
})
