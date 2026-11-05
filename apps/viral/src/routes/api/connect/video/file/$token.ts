import { createFileRoute } from "@tanstack/react-router"

import { isVideoCaller } from "@/server/viral/video-link"
import { sendForToken, streamSendFile } from "@/server/viral/video-sends"

const NEVER_CACHE = { "cache-control": "no-store" }

/**
 * Where Video fetches a sent vault item's video (`workspace/docs/send-to-video.md`).
 * Two guards: the key saved on Settings → Video connection, and the token,
 * which is 32 random bytes, kept only as its hash, opens one send's file and
 * lasts two hours or until the send arrives.
 */
export const Route = createFileRoute("/api/connect/video/file/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!(await isVideoCaller(request))) {
          return Response.json({ error: "Viral does not know this key." }, { status: 401, headers: NEVER_CACHE })
        }
        const send = await sendForToken(params.token)
        if (!send) return Response.json({ error: "No such file." }, { status: 404, headers: NEVER_CACHE })
        try {
          return await streamSendFile(send)
        } catch (error) {
          console.error("A file for Video could not be read", send.id, error)
          return Response.json({ error: "The file could not be read. Try again." }, { status: 502, headers: NEVER_CACHE })
        }
      },
    },
  },
})
