import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/sponsor-reports/[token]/export/route"
import { toNextRequest } from "@/lib/web-response"

export const Route = createFileRoute("/sponsor-reports/$token/export")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        GET(toNextRequest(request), { params: Promise.resolve({ token: params.token }) }),
    },
  },
})
