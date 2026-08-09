import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { getOwnedExport } from "@/server/video/exports"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * An export's cover picture. Session-checked like the file itself, and cached
 * only briefly — the cover can be changed to a different moment of the video,
 * and a long cache would keep handing back the old one.
 */
export const Route = createFileRoute("/api/v1/video/exports/$exportId/cover")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401 }
          )
        }

        let storagePath: string | null = null
        try {
          storagePath = (await getOwnedExport(user.id, params.exportId))
            .thumbnailStoragePath
        } catch {
          storagePath = null
        }
        if (!storagePath) {
          return Response.json({ detail: "No cover picture" }, { status: 404 })
        }

        return streamPrivateR2Object({
          storagePath,
          contentType: "image/jpeg",
          cacheControl: "private, max-age=300",
        })
      },
    },
  },
})
