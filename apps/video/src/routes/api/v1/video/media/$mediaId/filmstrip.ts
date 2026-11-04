import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"

import { filmstripSheetPath } from "@/lib/video/filmstrip-sheets"
import { db } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { kickVideoMediaWorker } from "@/server/video/media-workers"
import { streamPrivateR2Object } from "@/server/video/r2-response"
import { mediaViewerId } from "@/server/video/project-guests"

/**
 * The tiled frame sprite for one video. While the strip is still being built
 * the answer is 202 + Retry-After, so the timeline can poll instead of showing
 * a broken image. That includes a video uploaded so recently the worker has
 * not given it a row yet, which happens within one fifteen-second tick. A
 * strip that gave up after its last try answers 422, so the timeline can say
 * it failed instead of waiting forever. Once ready, the grid geometry rides
 * in X-Filmstrip-* headers beside the JPEG.
 *
 * A long video's frames are spread over several pictures, its sheets
 * (`filmstrip-sheets.ts`). `?sheet=2` asks for the third; no `sheet` is the
 * first, which is all a strip made before sheets has.
 */
export const Route = createFileRoute("/api/v1/video/media/$mediaId/filmstrip")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // A guest sent from Project is answered for their own project's files.
        const viewerId = await mediaViewerId(params.mediaId)
        if (!viewerId) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401 }
          )
        }

        const media = await getOwnedMedia(viewerId, params.mediaId).catch(
          () => null
        )
        if (!media) {
          return Response.json(
            { detail: "Filmstrip not found" },
            { status: 404 }
          )
        }

        const result = await db.execute(sql`
          select status, storage_path, frame_count, frame_width, frame_height, columns, duration_ms,
            sheet_count, rows_per_sheet
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
              sheet_count: number
              rows_per_sheet: number | null
            }
          | undefined

        const building = row
          ? row.status === "queued" || row.status === "generating"
          : media.fileType === "video"
        if (building) {
          kickVideoMediaWorker()
          return new Response(null, {
            status: 202,
            headers: { "Cache-Control": "no-store", "Retry-After": "2" },
          })
        }

        if (row?.status === "error") {
          return Response.json(
            { detail: "Filmstrip failed" },
            { status: 422, headers: { "Cache-Control": "no-store" } }
          )
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

        const sheetCount = row.sheet_count || 1
        const sheet = Number(new URL(request.url).searchParams.get("sheet") ?? 0)
        if (!Number.isInteger(sheet) || sheet < 0 || sheet >= sheetCount) {
          return Response.json({ detail: "No such sheet" }, { status: 404 })
        }
        // A strip made before sheets is one picture of as many rows as it
        // needed.
        const rowsPerSheet =
          row.rows_per_sheet ?? Math.ceil(row.frame_count / row.columns)

        const response = await streamPrivateR2Object({
          storagePath: filmstripSheetPath(row.storage_path, sheet),
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
          response.headers.set("X-Filmstrip-Sheets", String(sheetCount))
          response.headers.set("X-Filmstrip-Rows-Per-Sheet", String(rowsPerSheet))
        }
        return response
      },
    },
  },
})
