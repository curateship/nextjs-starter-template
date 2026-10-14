import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { requestIp } from "@/server/auth/origin"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { pairRack, RackRefusal } from "@/server/phones/rack"
import { refuse } from "@/server/phones/rack-http"

const pairShape = z.object({
  code: z.string().min(1).max(40),
  name: z.string().max(120).default(""),
  platform: z.string().max(80).default(""),
  version: z.string().max(40).default(""),
})

/**
 * The rack program swaps a one-time code from the Phones dashboard for its
 * own key, once. Not signed, because the rack has no key yet: the code is
 * the proof, and it works once, for fifteen minutes, with ten tries per
 * address per fifteen minutes. The key goes back over HTTPS in this answer
 * and is never shown again.
 */
export const Route = createFileRoute("/api/rack/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await enforceRateLimit(`rack-pair:${requestIp()}`, { maxAttempts: 10, windowSeconds: 900 })
        } catch (error) {
          if (error instanceof RateLimitError) return refuse(429, "Too many tries. Wait fifteen minutes.")
          throw error
        }
        // A pairing request is a few hundred characters.
        if (Number(request.headers.get("content-length") ?? 0) > 4_096) return refuse(413, "This is not a pairing request.")
        let input: z.infer<typeof pairShape>
        try {
          input = pairShape.parse(await request.json())
        } catch {
          return refuse(400, "This is not a pairing request.")
        }
        try {
          return Response.json(await pairRack(input), { headers: { "cache-control": "no-store" } })
        } catch (error) {
          if (error instanceof RackRefusal) return refuse(error.status, error.message)
          if (error instanceof Error && error.message === "ENCRYPTION_NOT_CONFIGURED") {
            return refuse(503, "Promo has no encryption key set, so it cannot keep a rack's key. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY.")
          }
          console.error("Pairing a rack failed", error)
          return refuse(500, "Promo could not pair this rack. It is in the server's log.")
        }
      },
    },
  },
})
