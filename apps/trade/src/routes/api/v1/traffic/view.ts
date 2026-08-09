import { createFileRoute } from "@tanstack/react-router"
import { getRequestHeader } from "@tanstack/react-start/server"

import { isAdminHref } from "@/lib/custom-shell"
import { requireAppOrigin } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  describeRequestOrigin,
  findSessionContext,
  isAdmin,
  now,
} from "@/server/auth/security"
import {
  classifyDevice,
  getDaySalt,
  hashVisitor,
  isBotUserAgent,
  isPrefetchPurpose,
  normalizeReferrer,
  normalizeTrafficPath,
  recordVisit,
  trafficDay,
} from "@/server/traffic"

/**
 * The beacon every page view lands on. It always answers 204 with nothing in
 * it — success, junk, bot, rate-limited, or broken alike — because a tracker
 * has no user to explain itself to, and a different answer per cause would
 * let anybody probe what gets counted.
 *
 * The filters run cheapest-first, and all of them run here on the server:
 * the client-side skip of /admin paths is bandwidth politeness, not the
 * gate. One beacon a navigation is the deal — the client hook keeps to it.
 */

// A path, maybe a referrer, and nothing else worth reading.
const MAX_BODY_BYTES = 2_000

// Roughly a view every 2.5 seconds all window long — more than any human
// clicks, less than a hammering script.
const RATE_LIMIT = { maxAttempts: 240, windowSeconds: 600 }

export const Route = createFileRoute("/api/v1/traffic/view")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await countView(request)
        } catch {
          // A beacon never surfaces errors.
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})

async function countView(request: Request) {
  requireAppOrigin()

  // Refuse an oversized payload before reading it, then again after — the
  // header is the sender's claim, the length is the truth.
  const claimed = Number(request.headers.get("content-length") ?? 0)
  if (claimed > MAX_BODY_BYTES) return
  const body = await request.text()
  if (body.length > MAX_BODY_BYTES) return
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== "object" || parsed === null) return
  const { path: rawPath, referrer } = parsed as {
    path?: unknown
    referrer?: unknown
  }

  const path = normalizeTrafficPath(rawPath)
  if (!path || isAdminHref(path)) return

  const origin = describeRequestOrigin()
  if (isBotUserAgent(origin.userAgent)) return
  if (
    isPrefetchPurpose(getRequestHeader("sec-purpose")) ||
    isPrefetchPurpose(getRequestHeader("purpose"))
  ) {
    return
  }

  const at = now()
  const salt = await getDaySalt(trafficDay(at))
  const visitorHash = hashVisitor(
    salt,
    origin.ipAddress ?? "",
    origin.userAgent ?? ""
  )

  // Before the session lookup, so a hammering client is turned away for the
  // cost of one query, not two. The hash in the key, never the IP, so no raw
  // address lands in rate_limits either. Throws RATE_LIMITED into the catch
  // above.
  await enforceRateLimit(`traffic:${visitorHash}`, RATE_LIMIT)

  // Admins never count — neither as themselves nor while viewing as a member.
  const session = await findSessionContext()
  if (session && (session.viewedBy || isAdmin(session.user))) return
  const audience = session ? "member" : "visitor"

  await recordVisit(
    {
      path,
      referrerDomain: normalizeReferrer(
        referrer,
        getRequestHeader("host")?.split(":")[0] ?? null
      ),
      device: classifyDevice(origin.userAgent ?? ""),
      audience,
      visitorHash,
    },
    undefined,
    at
  )
}
