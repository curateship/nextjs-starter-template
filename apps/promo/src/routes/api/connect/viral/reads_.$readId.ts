import { createFileRoute } from "@tanstack/react-router"

import { answerViral } from "@/server/viral-link/link"
import { readStatus } from "@/server/viral-link/reads"

/** Where one of Viral's reads stands. The key is the guard, and only the key's own reads answer. */
export const Route = createFileRoute("/api/connect/viral/reads_/$readId")({
  server: {
    handlers: {
      GET: ({ request, params }) => answerViral(request, null, (link) => readStatus(link, params.readId.slice(0, 64))),
    },
  },
})
