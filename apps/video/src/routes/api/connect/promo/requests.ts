import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { isPromoCaller } from "@/server/video/promo-link"
import { makeRequestedVideo, REQUEST_BRIEF_MAX, RequestRefusal } from "@/server/video/promo-requests"

const NEVER_CACHE = { "cache-control": "no-store" }

const requestShape = z.object({
  projectId: z.string().min(1).max(36),
  brief: z.string().max(REQUEST_BRIEF_MAX),
  promoProjectName: z.string().max(200).default(""),
})

/**
 * Ask for a video from Promo (part 42, `workspace/docs/send-to-promo.md`):
 * makes a draft video with the brief in the picked project. The key saved on
 * Settings → Promo is the guard.
 */
export const Route = createFileRoute("/api/connect/promo/requests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isPromoCaller(request))) {
          return Response.json({ error: "Video does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
          return Response.json({ error: "This message is too large." }, { status: 413, headers: NEVER_CACHE })
        }
        const parsed = requestShape.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: "This message is not in a shape Video knows." }, { status: 400, headers: NEVER_CACHE })
        try {
          return Response.json(await makeRequestedVideo(parsed.data), { headers: NEVER_CACHE })
        } catch (error) {
          if (error instanceof RequestRefusal) return Response.json({ error: error.message }, { status: error.status, headers: NEVER_CACHE })
          console.error("An asked-for video could not be made", error)
          return Response.json({ error: "Video could not make the video. It is in the server's log." }, { status: 500, headers: NEVER_CACHE })
        }
      },
    },
  },
})
