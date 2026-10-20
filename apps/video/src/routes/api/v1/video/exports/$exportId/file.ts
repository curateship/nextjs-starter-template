import { createFileRoute } from "@tanstack/react-router"

import { getOwnedExport } from "@/server/video/exports"
import { streamPrivateR2Object } from "@/server/video/r2-response"
import { exportViewerId } from "@/server/video/project-guests"

/**
 * The finished file, streamed through the app so it arrives as a download with
 * a name on it rather than opening in a tab.
 *
 * It goes through here rather than straight from storage for two reasons: the
 * session is checked, and `?filename=` decides what the browser saves it as.
 * A kept carousel is its ZIP of slides and caption, saved as `.zip`.
 */
export const Route = createFileRoute("/api/v1/video/exports/$exportId/file")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // A guest sent from Project is answered for their own project's files.
        const viewerId = await exportViewerId(params.exportId)
        if (!viewerId) {
          return Response.json(
            { detail: "Missing Custom Shell session" },
            { status: 401 }
          )
        }

        let storagePath: string | null = null
        let carousel = false
        try {
          const row = await getOwnedExport(viewerId, params.exportId)
          storagePath = row.status === "ready" ? row.storagePath : null
          carousel = row.kind === "carousel"
        } catch {
          storagePath = null
        }
        if (!storagePath) {
          return Response.json({ detail: "Export not found" }, { status: 404 })
        }

        const url = new URL(request.url)
        const response = await streamPrivateR2Object({
          storagePath,
          contentType: carousel ? "application/zip" : "video/mp4",
          range: request.headers.get("Range"),
          cacheControl: "private, max-age=31536000, immutable",
        })
        if (response.ok || response.status === 206) {
          response.headers.set(
            "Content-Disposition",
            `attachment; filename="${downloadName(url.searchParams.get("filename"), carousel ? ".zip" : ".mp4")}"`
          )
        }
        return response
      },
    },
  },
})

/**
 * A safe file name. Anything a browser or a file system would argue about is
 * replaced, because this ends up inside a quoted header and then on somebody's
 * disk.
 */
function downloadName(requested: string | null, extension: ".mp4" | ".zip") {
  const cleaned = (requested ?? "")
    .replace(/[^\w \-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  const base = cleaned || "export"
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`
}
