import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { findCurrentUser } from "@/server/auth/security"
import { db } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * The tiled frame sprite for one video. While the strip is still being built
 * the answer is 202 + Retry-After, so the timeline can poll instead of showing
 * a broken image; once ready, the grid geometry rides in X-Filmstrip-* headers
 * beside the JPEG.
 */
export const Route = createFileRoute("/api/v1/video/media/$mediaId/filmstrip")({
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

        try {
          await getOwnedMedia(user.id, params.mediaId)
        } catch {
          return Response.json(
            { detail: "Filmstrip not found" },
            { status: 404 }
          )
        }

        const result = await db.execute(sql`
          select status, storage_path, frame_count, frame_width, frame_height, columns, duration_ms
          from video_media_filmstrips
          where media_id = ${params.mediaId}
        `)
        const row = result.rows[0] as
          | {
              status: string
              storage_path: string | null
              frame_count: number | null
              frame_width: number | null
              frame_height: number | null
              columns: number | null
              duration_ms: number | null
            }
          | undefined

        if (row && (row.status === "queued" || row.status === "generating")) {
          kickVideoMediaWorker()
          return new Response(null, {
            status: 202,
            headers: { "Cache-Control": "no-store", "Retry-After": "2" },
          })
        }

        if (
          !row ||
          row.status !== "ready" ||
          !row.storage_path ||
          !row.frame_count ||
          !row.frame_width ||
          !row.frame_height ||
          !row.columns ||
          !row.duration_ms
        ) {
          return Response.json(
            { detail: "Filmstrip not found" },
            { status: 404 }
          )
        }

        const response = await streamPrivateR2Object({
          storagePath: row.storage_path,
          contentType: "image/jpeg",
          // Not immutable on purpose: the strip can be rebuilt while its
          // consumer keeps polling the same stable address.
          cacheControl: "private, max-age=3600",
        })
        if (response.ok) {
          response.headers.set("X-Filmstrip-Columns", String(row.columns))
          response.headers.set("X-Filmstrip-Duration-Ms", String(row.duration_ms))
          response.headers.set("X-Filmstrip-Frame-Count", String(row.frame_count))
          response.headers.set("X-Filmstrip-Frame-Height", String(row.frame_height))
          response.headers.set("X-Filmstrip-Frame-Width", String(row.frame_width))
        }
        return response
      },
    },
  },
})
