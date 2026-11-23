import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { readCallBody, videoCallerOwnerId } from "@/server/viral/video-link"
import { applyVideoEvent } from "@/server/viral/video-sends"

const eventShape = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("arrived"),
    sendId: z.string().min(1).max(64),
    videoId: z.string().min(1).max(64),
    editUrl: z.string().url().max(600),
  }),
  z.object({ type: z.literal("failed"), sendId: z.string().min(1).max(64), error: z.string().max(500).default("") }),
])

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * Video's news about a send: the original arrived in the draft's Media, or
 * the copy failed (`workspace/docs/send-to-video.md`). The key saved on
 * Settings → Video connection is the guard.
 */
export const Route = createFileRoute("/api/connect/video/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await videoCallerOwnerId(request)
        if (!ownerId) {
          return Response.json({ error: "Viral does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        const read = await readCallBody(request, 20_000)
        if (read.tooLarge) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = eventShape.safeParse(read.body)
        if (!parsed.success) {
          return Response.json({ error: "This message is not in a shape Viral knows." }, { status: 400, headers: NEVER_CACHE })
        }
        return Response.json(await applyVideoEvent(ownerId, parsed.data), { headers: NEVER_CACHE })
      },
    },
  },
})
