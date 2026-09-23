import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { findCurrentUser } from "@/server/auth/security"
import { db } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { kickVideoMediaWorker } from "@/server/video/media-workers"

/**
 * The shape of the sound in one file, as base64 points plus how long they
 * span. While the points are still being built the answer is 202 +
 * Retry-After, so the timeline keeps its placeholder and polls instead of
 * failing.
 */
export const Route = createFileRoute("/api/v1/video/media/$mediaId/waveform")({
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
          return Response.json({ detail: "Waveform not found" }, { status: 404 })
        }

        const result = await db.execute(sql`
          select status, peaks, point_count, duration_ms
          from video_media_waveforms
          where media_id = ${params.mediaId}
        `)
        const row = result.rows[0] as
          | {
              status: string
              peaks: string | null
              point_count: number | null
              duration_ms: number | null
            }
          | undefined

        // A file uploaded seconds ago may not have been discovered yet, so a
        // missing row is waited on like a queued one.
        if (!row || row.status === "queued" || row.status === "generating") {
          kickVideoMediaWorker()
          return new Response(null, {
            status: 202,
            headers: { "Cache-Control": "no-store", "Retry-After": "2" },
          })
        }

        if (row.status !== "ready" || row.peaks === null) {
          return Response.json({ detail: "Waveform not found" }, { status: 404 })
        }

        return Response.json(
          {
            peaks: row.peaks,
            pointCount: row.point_count ?? 0,
            durationMs: row.duration_ms ?? 0,
          },
          // Not immutable: the points can be rebuilt under the same address.
          { headers: { "Cache-Control": "private, max-age=3600" } }
        )
      },
    },
  },
})
