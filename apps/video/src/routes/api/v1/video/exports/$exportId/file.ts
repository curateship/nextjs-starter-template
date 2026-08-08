import { createFileRoute } from "@tanstack/react-router"

import { findCurrentUser } from "@/server/auth/security"
import { getOwnedExport } from "@/server/video/exports"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * The finished file, streamed through the app so it arrives as a download with
 * a name on it rather than opening in a tab.
 *
 * It goes through here rather than straight from storage for two reasons: the
 * session is checked, and `?filename=` decides what the browser saves it as.
 */
export const Route = createFileRoute("/api/v1/video/exports/$exportId/file")({
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

        let storagePath: string | null = null
        try {
          const row = await getOwnedExport(user.id, params.exportId)
          storagePath = row.status === "ready" ? row.storagePath : null
        } catch {
          storagePath = null
        }
        if (!storagePath) {
          return Response.json({ detail: "Export not found" }, { status: 404 })
        }

        const url = new URL(request.url)
        const response = await streamPrivateR2Object({
          storagePath,
          contentType: "video/mp4",
          range: request.headers.get("Range"),
          cacheControl: "private, max-age=31536000, immutable",
        })
        if (response.ok || response.status === 206) {
          response.headers.set(
            "Content-Disposition",
            `attachment; filename="${downloadName(url.searchParams.get("filename"))}"`
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
function downloadName(requested: string | null) {
  const cleaned = (requested ?? "")
    .replace(/[^\w \-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  const base = cleaned || "export"
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`
}
