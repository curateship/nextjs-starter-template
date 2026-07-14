import { createFileRoute } from "@tanstack/react-router"

import { getOwnedMedia } from "@/server/media"
import { streamPrivateR2Object } from "@/server/r2-response"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/media/$mediaId/proxy")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing AI Video session" },
            { status: 401 }
          )
        }

        let media
        try {
          media = await getOwnedMedia(user.id, params.mediaId)
        } catch {
          return Response.json({ detail: "Media not found" }, { status: 404 })
        }

        if (media.proxyStatus !== "ready" || !media.proxyStoragePath) {
          return Response.json(
            { detail: "Media proxy not found" },
            { status: 404 }
          )
        }

        return streamPrivateR2Object({
          storagePath: media.proxyStoragePath,
          contentType: "video/mp4",
          range: request.headers.get("Range"),
          cacheControl: "private, max-age=31536000, immutable",
          missingBodyMessage: "Failed to load media proxy",
          storageNotConfiguredMessage:
            "R2 storage is not configured. Set the AI_VIDEO_R2_* environment variables.",
          failureMessage: "Failed to load media proxy",
        })
      },
    },
  },
})
