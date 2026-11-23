import { createFileRoute } from "@tanstack/react-router"

import { promoCallerOwnerId } from "@/server/viral/promo-link"
import { applyPromoPosted, promoPostedShape } from "@/server/viral/promo-posts"
import { readCallBody } from "@/server/viral/video-link"

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * Promo's news about a post that came from a vault idea: it went up, or its
 * views moved (`workspace/docs/promo-connection.md`). The idea turns Posted
 * and keeps your views. The key saved on Settings → Promo connection is the
 * guard.
 */
export const Route = createFileRoute("/api/connect/promo/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await promoCallerOwnerId(request)
        if (!ownerId) {
          return Response.json({ error: "Viral does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        const read = await readCallBody(request, 20_000)
        if (read.tooLarge) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = promoPostedShape.safeParse(read.body)
        if (!parsed.success) {
          return Response.json({ error: "This message is not in a shape Viral knows." }, { status: 400, headers: NEVER_CACHE })
        }
        return Response.json(await applyPromoPosted(ownerId, parsed.data), { headers: NEVER_CACHE })
      },
    },
  },
})
