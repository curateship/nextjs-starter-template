import { createFileRoute } from "@tanstack/react-router"

import { batchSchema, ingestBatch, MAX_BODY_BYTES } from "@/server/ingest"
import { getClientIp, isRateLimited } from "@/server/rate-limit"
import { resolveSiteByPublicId } from "@/server/sites"
import { parseUserAgent, readCountryCode } from "@/server/user-agent"

const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

// Public, cross-origin endpoint hit by the snippet on arbitrary sites.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

// Never fail visibly: the beacon should never retry or surface errors.
function noContent() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

function readPublicId(request: Request, body: unknown): string {
  const fromQuery = new URL(request.url).searchParams.get("s")
  if (fromQuery) return fromQuery
  if (body && typeof body === "object" && "site" in body) {
    const value = (body as { site?: unknown }).site
    if (typeof value === "string") return value
  }
  return ""
}

export const Route = createFileRoute("/api/v1/track")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        try {
          const contentLength = Number(
            request.headers.get("content-length") || 0
          )
          if (contentLength > MAX_BODY_BYTES) return noContent()

          const rawBody = await request.text().catch(() => "")
          if (!rawBody || rawBody.length > MAX_BODY_BYTES) return noContent()

          let parsed: unknown
          try {
            parsed = JSON.parse(rawBody)
          } catch {
            return noContent()
          }

          const publicId = readPublicId(request, parsed)
          if (!publicId) return noContent()

          const site = await resolveSiteByPublicId(publicId)
          if (!site) return noContent()

          const ip = getClientIp(request.headers)
          if (isRateLimited(`track:${site.id}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) {
            return noContent()
          }

          const validation = batchSchema.safeParse(parsed)
          if (!validation.success || validation.data.events.length === 0) {
            return noContent()
          }

          // One browser per request, so audience dimensions derive once here.
          const dimensions = {
            ...parseUserAgent(request.headers.get("user-agent")),
            country: readCountryCode(request.headers),
          }

          await ingestBatch(
            site.id,
            site.domain,
            validation.data.events,
            dimensions
          )
          return noContent()
        } catch {
          // Swallow everything — tracking must never break the host page.
          return noContent()
        }
      },
    },
  },
})
