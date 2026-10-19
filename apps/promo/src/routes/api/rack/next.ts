import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { nextAction } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"
import { takeLogRequest } from "@/server/phones/rack-log"

/**
 * Every few seconds: the oldest waiting action for this rack, or none, and
 * `sendLog`, true once after the Rack window's Log tab asked, which the rack
 * answers by posting its last lines to `/api/rack/log`.
 */
export const Route = createFileRoute("/api/rack/next")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, z.object({}), async (rack) => ({
          action: await nextAction(rack),
          sendLog: takeLogRequest(rack.id),
        })),
    },
  },
})
