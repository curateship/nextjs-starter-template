import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { isVideoCaller } from "@/server/viral/video-link"
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
        if (!(await isVideoCaller(request))) {
          return Response.json({ error: "Viral does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = eventShape.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json({ error: "This message is not in a shape Viral knows." }, { status: 400, headers: NEVER_CACHE })
        }
        return Response.json(await applyVideoEvent(parsed.data), { headers: NEVER_CACHE })
      },
    },
  },
})
