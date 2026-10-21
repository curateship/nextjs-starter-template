import { createFileRoute } from "@tanstack/react-router"

import { readCarouselExportSlide } from "@/server/video/carousel-exports"
import { findSharedExport } from "@/server/video/export-shares"
import { streamPrivateR2Object } from "@/server/video/r2-response"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * The file behind a share link, for somebody with no account. The token in the
 * address is the only check, and it is made again on every request, including
 * every range request while the video plays. So turning a link off, letting it
 * expire or deleting the export stops the next request, not the next day.
 *
 * `no-store` keeps the browser and anything between it and here from holding
 * a copy that would outlive the link.
 *
 * A shared carousel answers `?slide=2` with that one slide's PNG, or a video
 * slide's MP4, read out of the kept ZIP by its byte range, the same check
 * made first.
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

        const url = new URL(request.url)
        const slide = url.searchParams.get("slide")
        if (shared.kind === "carousel" && slide !== null) {
          return sharedSlideResponse(
            shared.storagePath,
            shared.slideRanges,
            Number(slide)
          )
        }

        const response = await streamPrivateR2Object({
          storagePath: shared.storagePath,
          contentType: shared.kind === "carousel" ? "application/zip" : "video/mp4",
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

async function sharedSlideResponse(
  storagePath: string,
  ranges: Parameters<typeof readCarouselExportSlide>[1],
  index: number
) {
  let png: Awaited<ReturnType<typeof readCarouselExportSlide>>
  try {
    png = await readCarouselExportSlide(storagePath, ranges, index)
  } catch (error) {
    console.error("Shared carousel slide could not be read", error)
    return Response.json(
      { detail: "The slide could not be loaded right now" },
      { status: 503, headers: NO_STORE }
    )
  }
  if (!png) {
    return Response.json(
      { detail: "That slide is not in this carousel" },
      { status: 404, headers: NO_STORE }
    )
  }
  const video = ranges[index]?.type === "video"
  return new Response(png, {
    headers: {
      ...NO_STORE,
      "Content-Disposition": `inline; filename="slide-${index + 1}.${video ? "mp4" : "png"}"`,
      "Content-Type": video ? "video/mp4" : "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
