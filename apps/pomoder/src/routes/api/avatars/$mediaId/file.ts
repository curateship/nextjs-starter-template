import { createFileRoute } from "@tanstack/react-router"

import { findPublicAvatar } from "@/server/avatars"
import { getMediaObject } from "@/server/pomoder-media"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Profile pictures are as public as the display names they sit beside — the
// leaderboard and room invites both render signed out — so this route has no
// session check. It only serves ids that are somebody's current avatar.
export const Route = createFileRoute("/api/avatars/$mediaId/file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!UUID_PATTERN.test(params.mediaId)) return notFound()
        try {
          const avatar = await findPublicAvatar(params.mediaId)
          const object = await getMediaObject(avatar.storageKey, null)
          if (!object.Body) return notFound()
          const headers = new Headers({
            "Content-Type": avatar.mimeType,
            "X-Content-Type-Options": "nosniff",
            // Short and shared rather than immutable: an avatar id never
            // changes contents, but a picture removed by its owner or by a
            // moderator has to stop being served quickly.
            "Cache-Control": "public, max-age=300",
          })
          if (object.ContentLength !== undefined)
            headers.set("Content-Length", String(object.ContentLength))
          return new Response(object.Body.transformToWebStream(), { headers })
        } catch {
          return notFound()
        }
      },
    },
  },
})

function notFound() {
  return Response.json(
    { error: { code: "AVATAR_NOT_FOUND", message: "Avatar not found" } },
    { status: 404 }
  )
}
