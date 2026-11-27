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
        /** "wall" for the small picture every 5 seconds on the wall of every phone; the window's own otherwise. */
        lane: z.enum(["window", "wall"]).default("window"),
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
 * each watched phone and any texted code, in; which phones to show (`wanted`),
 * the taps waiting for each, and which phones the wall wants a small picture
 * of every 5 seconds (`wall`), out. Signed like every rack address.
 */
export const Route = createFileRoute("/api/rack/screen")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, screenShape, (rack, data) => exchangeScreens(rack, data)),
    },
  },
})
