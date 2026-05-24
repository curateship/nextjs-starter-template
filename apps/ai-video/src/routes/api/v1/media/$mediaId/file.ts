import { createFileRoute } from "@tanstack/react-router"

import { getOwnedMedia } from "@/server/media"
import {
  getFromR2,
  R2StorageNotConfiguredError,
} from "@/server/media-storage"
import { findCurrentUser } from "@/server/security"
import { getOrCreateCurrentWorkspace } from "@/server/workspaces"

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
          const workspace = await getOrCreateCurrentWorkspace(user.id)
          media = await getOwnedMedia(user.id, workspace.id, params.mediaId)
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
            "Cache-Control": "private, no-store",
            "Content-Type": object.ContentType || media.mimeType,
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

function toBodyInit(body: unknown): BodyInit {
  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream() as ReadableStream
  }

  return body as BodyInit
}
