import { createFileRoute } from "@tanstack/react-router"

import { GET } from "@/screens/directory-sitemaps/[chunk]/route"
import { toNextRequest } from "@/lib/web-response"

export const Route = createFileRoute("/directory-sitemaps/$chunk")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        GET(toNextRequest(request), { params: Promise.resolve({ chunk: params.chunk }) }),
    },
  },
})
