import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { keepLog, LOG_MAX_LINE_CHARS, LOG_MAX_LINES } from "@/server/phones/rack-log"
import { answerSigned } from "@/server/phones/rack-http"

const logShape = z.object({
  lines: z.array(z.string().max(LOG_MAX_LINE_CHARS)).max(LOG_MAX_LINES),
})

/**
 * The rack's answer to `sendLog: true` on `/api/rack/next`: the last lines
 * of its own `rack.log`, oldest first, for the Log tab of the Rack window.
 * Kept in memory until the next answer, never in the database.
 */
export const Route = createFileRoute("/api/rack/log")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, logShape, async (rack, data) => {
          keepLog(rack.id, data.lines)
          return { kept: data.lines.length }
        }),
    },
  },
})
