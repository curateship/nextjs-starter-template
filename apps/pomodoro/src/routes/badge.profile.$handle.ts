import { createFileRoute } from "@tanstack/react-router"

import { SHARE_CARD_MAX_AGE_SECONDS } from "@/lib/pomodoro/share-card"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import { findCurrentUser } from "@/server/auth/security"
import { renderShareCard } from "@/server/pomodoro/share-card"

/**
 * The picture a pasted profile link unfurls into:
 * `/badge/profile/<handle>.png`.
 *
 * It sits beside the streak badge rather than under `/u/`, because
 * `/u/$handle/$year` already claims every second segment there and matched
 * `card.png` as a year. The two pictures are the same kind of thing anyway:
 * one self-contained image, served by a plain route, cached five minutes,
 * 404 for anything that is not there.
 *
 * Open to anyone on purpose, because a preview bot has no account and never
 * will. Not a server function, so it is not in the guarded-endpoint list:
 * those are the app's own RPC addresses and a preview crawler cannot call
 * one. This is a plain GET that answers with a picture.
 *
 * An unknown handle, a switched-off profile and a hidden one all answer 404
 * alike, so a pasted link to any of them previews with nothing rather than a
 * broken picture, and nobody can tell the three apart.
 */
export const Route = createFileRoute("/badge/profile/$handle")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // The `.png` is cosmetic: some embeds and crawlers insist a
        // picture's address ends in one. Both spellings resolve to the same
        // card, exactly as the streak badge treats its `.svg`.
        const handle = params.handle.replace(/\.png$/i, "").toLowerCase()
        // Turned away before the database is asked, the same check the
        // profile page and the streak badge both make first.
        if (!isHandleAvailableShape(handle)) return notFound()

        // A signed-in reader who has been blocked gets the same 404 the
        // profile gives them. A preview crawler has no session and skips it.
        const viewer = await findCurrentUser()
        const png = await renderShareCard(handle, viewer?.id ?? null)
        if (!png) return notFound()

        return new Response(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": `public, max-age=${SHARE_CARD_MAX_AGE_SECONDS}`,
            // A preview bot fetches this from somebody else's domain, and
            // several read it through fetch rather than an <img>.
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
    },
  },
})

/** No body and no hint, so the three reasons for 404 stay indistinguishable. */
function notFound() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}
