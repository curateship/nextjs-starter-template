import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { findCurrentUser } from "@/server/auth/security"
import { db } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * The smooth-playback copy of one video, streamed with range support so the
 * editor can seek. Session-checked and ownership-scoped exactly like the
 * shell's own media file route; when no copy is ready the answer is a plain
 * 404 and consumers fall back to the original file.
 */
export const Route = createFileRoute("/api/v1/video/media/$mediaId/proxy")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const user = await findCurrentUser()
        if (!user) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401 }
          )
        }

        try {
          await getOwnedMedia(user.id, params.mediaId)
        } catch {
          return Response.json({ detail: "Media not found" }, { status: 404 })
        }

        const result = await db.execute(sql`
          select storage_path from video_media_proxies
          where media_id = ${params.mediaId} and status = 'ready' and storage_path is not null
        `)
        const storagePath = (
          result.rows[0] as { storage_path?: string } | undefined
        )?.storage_path
        if (!storagePath) {
          return Response.json(
            { detail: "Media proxy not found" },
            { status: 404 }
          )
        }

        return streamPrivateR2Object({
          storagePath,
          contentType: "video/mp4",
          range: request.headers.get("Range"),
          // The key changes on every rebuild, so a year of caching is safe.
          cacheControl: "private, max-age=31536000, immutable",
        })
      },
    },
  },
})
