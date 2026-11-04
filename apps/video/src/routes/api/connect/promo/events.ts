import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { isPromoCaller } from "@/server/video/promo-link"
import { applyPromoEvent } from "@/server/video/promo-sends"

const eventShape = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("arrived"),
    sendId: z.string().min(1).max(64),
    itemId: z.string().min(1).max(64),
    itemUrl: z.string().url().max(600),
  }),
  z.object({ type: z.literal("failed"), sendId: z.string().min(1).max(64), error: z.string().max(500).default("") }),
  z.object({
    type: z.literal("posted"),
    videoExportId: z.string().min(1).max(64),
    network: z.string().min(1).max(20),
    postUrl: z.string().max(600).default(""),
  }),
])

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * Promo's news: a send arrived in the archive, its copy failed, or a post
 * went out from it, which turns the video or carousel to Posted
 * (`workspace/docs/send-to-promo.md`). The key saved on Settings → Promo is
 * the guard.
 */
export const Route = createFileRoute("/api/connect/promo/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isPromoCaller(request))) {
          return Response.json({ error: "Video does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = eventShape.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: "This message is not in a shape Video knows." }, { status: 400, headers: NEVER_CACHE })
        return Response.json(await applyPromoEvent(parsed.data), { headers: NEVER_CACHE })
      },
    },
  },
})
