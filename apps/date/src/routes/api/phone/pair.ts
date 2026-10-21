import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { requestIp } from "@/server/auth/origin"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { refuse } from "@/server/phone/http"
import { pairPhone, PhoneRefusal } from "@/server/phone/link"

const pairShape = z.object({
  code: z.string().min(1).max(20),
  model: z.string().max(120).default(""),
  android: z.string().max(40).default(""),
  appVersion: z.string().max(40).default(""),
})

/**
 * The phone swaps the six-digit code from the dashboard's Phone panel for its own key,
 * once. Not signed, because the phone has no key yet: the code is the proof,
 * and it works once, for ten minutes, with ten tries per address per fifteen
 * minutes. The key goes back in this answer and is never shown again.
 */
export const Route = createFileRoute("/api/phone/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await enforceRateLimit(`phone-pair:${requestIp()}`, { maxAttempts: 10, windowSeconds: 900 })
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
          return Response.json(await pairPhone(input), { headers: { "cache-control": "no-store" } })
        } catch (error) {
          if (error instanceof PhoneRefusal) return refuse(error.status, error.message)
          if (error instanceof Error && error.message === "ENCRYPTION_NOT_CONFIGURED") {
            return refuse(
              503,
              "Date has no encryption key set, so it cannot keep the phone's key. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY and restart the server."
            )
          }
          console.error("Pairing a phone failed", error)
          return refuse(500, "Date could not pair this phone. It is in the server's log.")
        }
      },
    },
  },
})
