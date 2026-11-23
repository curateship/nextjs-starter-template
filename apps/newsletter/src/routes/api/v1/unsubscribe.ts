import { createFileRoute } from "@tanstack/react-router"

import { handleUnsubscribeRequest } from "@/server/broadcasts/unsubscribe-request"

export const Route = createFileRoute("/api/v1/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handleUnsubscribeRequest(request),
      // RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) arrives as POST.
      POST: ({ request }) => handleUnsubscribeRequest(request),
    },
  },
})
