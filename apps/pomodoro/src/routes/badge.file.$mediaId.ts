import { createFileRoute } from "@tanstack/react-router"

import { SHARE_CARD_MAX_AGE_SECONDS } from "@/lib/pomodoro/share-card"
import { findCurrentUser } from "@/server/auth/security"
import { renderSharedSoundCard } from "@/server/pomodoro/share-card"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The picture a pasted link to a shared sound unfurls into:
 * `/badge/file/<id>.png` (task 03, part 11). It sits beside the profile's
 * card for the same reason that card does: a picture a preview bot fetches,
 * open to anyone, cached five minutes, and 404 for anything not shared, so
 * nobody can tell an unshared file from one that never existed.
 */
export const Route = createFileRoute("/badge/file/$mediaId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const mediaId = params.mediaId.replace(/\.png$/i, "").toLowerCase()
        if (!UUID_PATTERN.test(mediaId)) return notFound()
        const viewer = await findCurrentUser()
        const png = await renderSharedSoundCard(mediaId, viewer?.id ?? null)
        if (!png) return notFound()
        return new Response(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": `public, max-age=${SHARE_CARD_MAX_AGE_SECONDS}`,
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
    },
  },
})

function notFound() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}
