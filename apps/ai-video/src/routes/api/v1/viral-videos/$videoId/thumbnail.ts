import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { streamPrivateR2Object } from "@/server/r2-response"
import { aiVideoViralVideos } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

export const Route = createFileRoute("/api/v1/viral-videos/$videoId/thumbnail")(
  {
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

          const [video] = await db
            .select()
            .from(aiVideoViralVideos)
            .where(
              and(
                eq(aiVideoViralVideos.id, params.videoId),
                eq(aiVideoViralVideos.userId, user.id)
              )
            )
            .limit(1)

          if (!video?.thumbnailStoragePath) {
            return Response.json(
              { detail: "Thumbnail not found" },
              { status: 404 }
            )
          }

          return streamPrivateR2Object({
            storagePath: video.thumbnailStoragePath,
            contentType: "image/jpeg",
            range: request.headers.get("Range"),
            cacheControl: "private, max-age=3600",
          })
        },
      },
    },
  }
)
