import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { actorImageFor } from "@/server/video/asset-factories/actors"
import { streamPrivateR2Object } from "@/server/video/r2-response"

const NO_STORE = { "Cache-Control": "no-store" }

export const Route = createFileRoute("/api/v1/video/actors/$actorId/image")({
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
          const media = await actorImageFor(user.id, params.actorId)
          return streamPrivateR2Object({
            storagePath: media.storagePath,
            contentType: media.mimeType,
            range: request.headers.get("Range"),
            cacheControl: "private, max-age=3600",
          })
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "Actor not found") {
            return Response.json(
              { detail: "Failed to load actor image" },
              { status: 500, headers: NO_STORE }
            )
          }
          return Response.json(
            { detail: "Actor not found" },
            { status: 404, headers: NO_STORE }
          )
        }
      },
    },
  },
})
