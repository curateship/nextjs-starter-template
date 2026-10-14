import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { answerSigned } from "@/server/phones/rack-http"
import { exchangeScreens } from "@/server/phones/screens"

const screenShape = z.object({
  frames: z
    .array(
      z.object({
        serial: z.string().max(120),
        jpeg: z.string().max(2_000_000).regex(/^[A-Za-z0-9+/=]*$/),
        width: z.number().int().min(1).max(10_000),
        height: z.number().int().min(1).max(10_000),
      })
    )
    .max(50)
    .default([]),
  texts: z
    .array(z.object({ serial: z.string().max(120), code: z.string().max(12), from: z.string().max(80) }))
    .max(50)
    .default([]),
})

/**
 * A few times a second while someone watches a phone: the newest picture of
 * each watched phone and any texted code, in; which phones to show and the
 * taps waiting for each, out. Signed like every rack address.
 */
export const Route = createFileRoute("/api/rack/screen")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, screenShape, (rack, data) => exchangeScreens(rack, data)),
    },
  },
})
