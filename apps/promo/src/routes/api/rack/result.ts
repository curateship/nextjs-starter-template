import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { finishAction } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"

const resultShape = z.object({
  id: z.string().min(1).max(36),
  ok: z.boolean(),
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  error: z.string().max(4_000).default(""),
  screenshots: z.array(z.string()).max(10).default([]),
})

/** The answer to one action, with any pictures it took. */
export const Route = createFileRoute("/api/rack/result")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, resultShape, async (rack, data) => ({ accepted: await finishAction(rack, data) })),
    },
  },
})
