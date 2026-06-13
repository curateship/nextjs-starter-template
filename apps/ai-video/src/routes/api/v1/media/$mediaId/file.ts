import { createFileRoute } from "@tanstack/react-router"

import { getOwnedMedia } from "@/server/media"
import {
  getFromR2,
  R2StorageNotConfiguredError,
  toBodyInit,
} from "@/server/media-storage"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/media/$mediaId/file")({
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

        try {
          const range = request.headers.get("Range")
          const object = await getFromR2(media.storagePath, range)
          const body = object.Body

          if (!body) {
            return Response.json({ detail: "Failed to load media" }, { status: 502 })
          }

          const headers = new Headers({
            "Accept-Ranges": "bytes",
            // A media id's bytes never change, so let the browser cache them
            // privately. Without this the player re-downloads from remote
            // storage for every <video> element and every seek/replay — and a
            // template's slots are all the same file, multiplying the cost.
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Type": object.ContentType || media.mimeType,
            "X-Content-Type-Options": "nosniff",
          })
          if (object.ContentLength !== undefined) {
            headers.set("Content-Length", object.ContentLength.toString())
          }
          if (object.ContentRange) {
            headers.set("Content-Range", object.ContentRange)
          }

          return new Response(toBodyInit(body), {
            status: range && object.ContentRange ? 206 : 200,
            headers,
          })
        } catch (error) {
          if (error instanceof R2StorageNotConfiguredError) {
            return Response.json(
              {
                detail:
                  "R2 storage is not configured. Set the AI_VIDEO_R2_* environment variables, including AI_VIDEO_R2_PUBLIC_URL.",
              },
              { status: 503 }
            )
          }

          return Response.json({ detail: "Failed to load media" }, { status: 502 })
        }
      },
    },
  },
})
