import { createFileRoute } from "@tanstack/react-router"

import { promoCallerOwnerId } from "@/server/viral/promo-link"
import { applyPromoReadAnswer, promoReadAnswerShape } from "@/server/viral/promo-reads"
import { readCallBody } from "@/server/viral/video-link"

const NEVER_CACHE = { "cache-control": "no-store" }

/** A read's answer is up to 100 posts of words, never more than this. */
const MAX_BODY_CHARS = 2_000_000

/**
 * Promo's answer to a read Viral asked for: the posts it found, or why it
 * failed (`workspace/docs/promo-connection.md`). The key saved on
 * Settings → Promo connection is the guard.
 */
export const Route = createFileRoute("/api/connect/promo/reads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await promoCallerOwnerId(request)
        if (!ownerId) {
          return Response.json({ error: "Viral does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        const read = await readCallBody(request, MAX_BODY_CHARS)
        if (read.tooLarge) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = promoReadAnswerShape.safeParse(read.body)
        if (!parsed.success) {
          return Response.json({ error: "This message is not in a shape Viral knows." }, { status: 400, headers: NEVER_CACHE })
        }
        return Response.json(await applyPromoReadAnswer(ownerId, parsed.data), { headers: NEVER_CACHE })
      },
    },
  },
})
