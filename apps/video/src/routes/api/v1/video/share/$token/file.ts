import { createFileRoute } from "@tanstack/react-router"

import { findSharedExport } from "@/server/video/export-shares"
import { streamPrivateR2Object } from "@/server/video/r2-response"

/**
 * The file behind a share link, for somebody with no account. The token in the
 * address is the only check, and it is made again on every request, including
 * every range request while the video plays. So turning a link off, letting it
 * expire or deleting the export stops the next request, not the next day.
 *
 * `no-store` keeps the browser and anything between it and here from holding
 * a copy that would outlive the link.
 */
export const Route = createFileRoute("/api/v1/video/share/$token/file")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        let shared: Awaited<ReturnType<typeof findSharedExport>>
        try {
          shared = await findSharedExport(params.token)
        } catch {
          // The check itself failed, which says nothing about the link. A 404
          // here would tell the viewer a working link is dead.
          return Response.json(
            { detail: "The video could not be loaded right now" },
            { status: 503, headers: { "Cache-Control": "no-store" } }
          )
        }
        if (!shared) {
          return Response.json(
            { detail: "This video is no longer available" },
            { status: 404, headers: { "Cache-Control": "no-store" } }
          )
        }

        const response = await streamPrivateR2Object({
          storagePath: shared.storagePath,
          contentType: "video/mp4",
          range: request.headers.get("Range"),
          cacheControl: "no-store",
        })
        if (response.ok || response.status === 206) {
          response.headers.set("Content-Disposition", "inline")
        }
        return response
      },
    },
  },
})
