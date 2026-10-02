import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { creatorAvatarPath } from "@/server/video/creators/creators"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * A creator's picture, served through the app rather than from the platform.
 *
 * Two reasons it is not just an `<img src>` pointing at YouTube. The platform's
 * own addresses expire, so a saved one goes blank after a while; and asking for
 * one tells the platform who is looking at whom.
 *
 * The session is checked and the creator has to be the asker's own, so one
 * person's id cannot read another's picture.
 */

const NO_STORE = { "Cache-Control": "no-store" }

export const Route = createFileRoute(
  "/api/v1/video/creators/$creatorId/avatar"
)({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401, headers: NO_STORE }
          )
        }
        try {
          const storagePath = await creatorAvatarPath(user.id, params.creatorId)
          return streamPrivateR2Object({
            storagePath,
            contentType: "image/jpeg",
            range: request.headers.get("Range"),
            cacheControl: "private, max-age=3600",
          })
        } catch {
          // A creator somebody else owns and one that never had a picture are
          // the same answer on purpose: neither tells you whether it exists.
          return Response.json(
            { detail: "No picture for that creator" },
            { status: 404, headers: NO_STORE }
          )
        }
      },
    },
  },
})
