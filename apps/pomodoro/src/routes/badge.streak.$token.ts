import { createFileRoute } from "@tanstack/react-router"

import {
  isBadgeTokenShape,
  renderStreakBadgeSvg,
  STREAK_BADGE_MAX_AGE_SECONDS,
} from "@/lib/pomodoro/streak-badge"
import {
  readCachedBadge,
  readStreakBadge,
  writeCachedBadge,
} from "@/server/pomodoro/streak-badge"

/**
 * The public streak badge: `/badge/streak/<token>.svg`.
 *
 * Open to anyone on purpose, because the whole point is an `<img>` tag on
 * somebody else's site. What protects it is that the address is unguessable
 * and that its owner asked for it; what limits it is that a badge can say
 * only two things, the streak number and the public display name.
 *
 * Not a server function, so it is not in the guarded-endpoint list: those are
 * the app's own RPC addresses, and an `<img>` cannot call one. This is a
 * plain GET that answers with an image.
 *
 * A missing, revoked or made-up address all answer 404 alike, so nobody can
 * learn from the response whether a badge ever existed.
 */
export const Route = createFileRoute("/badge/streak/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // The `.svg` is cosmetic: some embeds insist a picture's address ends
        // in one. Both spellings resolve to the same badge.
        const token = params.token.replace(/\.svg$/i, "")
        // Anything not shaped like a token is turned away before the database
        // is asked. See isBadgeTokenShape: it is what keeps `%00` from
        // throwing a 500 at anyone who asks for it.
        if (!isBadgeTokenShape(token)) return notFound()

        const cached = readCachedBadge(token)
        if (cached) return svg(cached)

        const badge = await readStreakBadge(token)
        if (!badge) return notFound()

        const body = renderStreakBadgeSvg({
          displayName: badge.displayName,
          currentStreak: badge.currentStreak,
        })
        writeCachedBadge(token, badge.userId, body)
        return svg(body)
      },
    },
  },
})

function svg(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${STREAK_BADGE_MAX_AGE_SECONDS}`,
      // A plain `<img>` needs no CORS at all. This is here for the embedders
      // that do: anything drawing the badge through fetch or onto a canvas.
      // It grants no more than the address already does, since holding the
      // address is the only thing the badge ever checks.
      "Access-Control-Allow-Origin": "*",
      // The document is built from a person's own display name, so it is
      // served as strictly a picture: no sniffing to some other type, and a
      // policy that switches off scripts and outside fetches even when the
      // address is opened directly rather than through an `<img>`.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}

/**
 * No body and no hint. A revoked badge and an invented one answer the same
 * way, and an `<img>` shows its broken-image mark for both.
 */
function notFound() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}
