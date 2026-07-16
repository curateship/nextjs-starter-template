import { createFileRoute } from "@tanstack/react-router"

import { dispatchApi } from "@/server/api-dispatch"

const handler = ({ request }: { request: Request }) => dispatchApi(request)

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: handler,
      GET: handler,
      OPTIONS: handler,
      PATCH: handler,
      POST: handler,
      PUT: handler,
    },
  },
})
