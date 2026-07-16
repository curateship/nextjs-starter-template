import { createFileRoute } from "@tanstack/react-router"

import { getOwnedMedia } from "@/server/media"
import { kickMediaProxyWorker } from "@/server/media-proxy"
import { streamPrivateR2Object } from "@/server/r2-response"
import { findCurrentUser } from "@/server/security"
import type { AiVideoMedia } from "@/server/schema"

export const Route = createFileRoute("/api/v1/media/$mediaId/filmstrip")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const media = await loadOwnedFilmstrip(params.mediaId)
        if (media instanceof Response) return media

        const response = await streamPrivateR2Object({
          storagePath: media.filmstripStoragePath!,
          contentType: "image/jpeg",
          // Not `immutable`: the sprite is regenerated in place at this stable
          // per-media URL (e.g. when a clip's filmstrip is rebuilt), so the
          // browser must be allowed to revalidate rather than pin the old bytes
          // for a year. Matches the sibling thumbnail endpoints.
          cacheControl: "private, max-age=3600",
          missingBodyMessage: "Failed to load filmstrip",
          storageNotConfiguredMessage:
            "R2 storage is not configured. Set the AI_VIDEO_R2_* environment variables.",
          failureMessage: "Failed to load filmstrip",
        })
        if (response.ok) {
          filmstripHeaders(media).forEach((value, name) =>
            response.headers.set(name, value)
          )
        }
        return response
      },
    },
  },
})

async function loadOwnedFilmstrip(mediaId: string) {
  const user = await findCurrentUser()
  if (!user) {
    return Response.json(
      { detail: "Missing AI Video session" },
      { status: 401 }
    )
  }

  let media: AiVideoMedia
  try {
    media = await getOwnedMedia(user.id, mediaId)
  } catch {
    return Response.json({ detail: "Filmstrip not found" }, { status: 404 })
  }

  if (
    media.filmstripStatus === "queued" ||
    media.filmstripStatus === "generating"
  ) {
    kickMediaProxyWorker()
    return new Response(null, {
      status: 202,
      headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    })
  }
  if (
    media.filmstripStatus !== "ready" ||
    !media.filmstripStoragePath ||
    !media.filmstripFrameCount ||
    !media.filmstripFrameWidth ||
    !media.filmstripFrameHeight ||
    !media.filmstripColumns ||
    !media.filmstripDurationMs
  ) {
    return Response.json({ detail: "Filmstrip not found" }, { status: 404 })
  }
  return media
}

function filmstripHeaders(media: AiVideoMedia) {
  return new Headers({
    "Cache-Control": "private, max-age=3600",
    "Content-Type": "image/jpeg",
    "X-Content-Type-Options": "nosniff",
    "X-Filmstrip-Columns": String(media.filmstripColumns),
    "X-Filmstrip-Duration-Ms": String(media.filmstripDurationMs),
    "X-Filmstrip-Frame-Count": String(media.filmstripFrameCount),
    "X-Filmstrip-Frame-Height": String(media.filmstripFrameHeight),
    "X-Filmstrip-Frame-Width": String(media.filmstripFrameWidth),
  })
}
