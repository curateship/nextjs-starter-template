import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { finishAction } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"

const resultShape = z.object({
  id: z.string().min(1).max(36),
  ok: z.boolean(),
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  error: z.string().max(4_000).default(""),
  steps: z
    .array(z.object({ step: z.string().max(200).default(""), jpeg: z.string() }))
    // More than Promo keeps is trimmed when kept, never refused: a refused
    // answer would lose whether a comment went out.
    .max(200)
    .default([]),
  banScreen: z
    .object({ app: z.string().max(20), kind: z.string().max(20), words: z.string().max(2_000) })
    .nullable()
    .default(null),
  recovered: z.string().max(10).default(""),
})

/** The answer to one action, with a picture of each step it took. */
export const Route = createFileRoute("/api/rack/result")({
  server: {
    handlers: {
      POST: ({ request }) =>
        answerSigned(request, resultShape, async (rack, data) => ({ accepted: await finishAction(rack, data) })),
    },
  },
})
