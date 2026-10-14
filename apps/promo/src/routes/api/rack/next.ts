import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { nextAction } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"

/** Every few seconds: the oldest waiting action for this rack, or none. */
export const Route = createFileRoute("/api/rack/next")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, z.object({}), async (rack) => ({ action: await nextAction(rack) })),
    },
  },
})
