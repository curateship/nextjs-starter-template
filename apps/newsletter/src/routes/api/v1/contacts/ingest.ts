import { createFileRoute } from "@tanstack/react-router"

import { handleIngestRequest } from "@/server/ingest"

export const Route = createFileRoute("/api/v1/contacts/ingest")({
  server: {
    handlers: {
      POST: ({ request }) => handleIngestRequest(request),
    },
  },
})
