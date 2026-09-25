import { and, eq } from "drizzle-orm"

import {
  parseListingBadgeSize,
  parseListingBadgeTheme,
  renderListingBadgeHtml,
  type ListingBadgeData,
} from "@/lib/directory/listing-badge"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { db, type CustomShellDb } from "@/server/db"
import { directoryListings } from "@/server/directory/schema"
import { directorySettingsFor } from "@/server/directory/settings"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DOCUMENT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // This permission is the point of this one response: other sites must be
  // allowed to frame it. The rest of the policy keeps the document inert.
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
}

export const LISTING_BADGE_CACHE =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
export const LISTING_BADGE_NOT_FOUND_CACHE =
  "public, max-age=60, s-maxage=300"

function response(body: string, status: number, cacheControl: string) {
  return new Response(body, {
    status,
    headers: { ...DOCUMENT_HEADERS, "Cache-Control": cacheControl },
  })
}

function notFound() {
  return response("Not found", 404, LISTING_BADGE_NOT_FOUND_CACHE)
}

async function publishedBadgeListing(
  workspaceId: string,
  listingId: string,
  database: CustomShellDb
): Promise<ListingBadgeData | null> {
  if (!UUID.test(listingId)) return null

  const [listing] = await database
    .select({
      title: directoryListings.title,
      slug: directoryListings.slug,
      featuredImage: directoryListings.featuredImage,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.id, listingId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)

  return listing ?? null
}

type BadgeSite = { id: string; name: string }

/** The route's work, kept here so its headers and refusal paths can be tested. */
export async function listingBadgeResponse(input: {
  request: Request
  site: BadgeSite | null
  listingId: string
  requestAddress: string
  database?: CustomShellDb
  limit?: typeof enforceRateLimit
}) {
  if (!input.site) return notFound()

  const database = input.database ?? db
  const settings = await directorySettingsFor(input.site.id, database)
  if (!settings.badgesEnabled) return notFound()

  const limit = input.limit ?? enforceRateLimit
  try {
    await limit(
      `directory-listing-badge:${input.site.id}:${input.requestAddress}`,
      { maxAttempts: 120, windowSeconds: 60 },
      database
    )
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      const limited = response("Too many requests", 429, "no-store")
      limited.headers.set("Retry-After", "60")
      return limited
    }
    throw error
  }

  const listing = await publishedBadgeListing(
    input.site.id,
    input.listingId,
    database
  )
  if (!listing) return notFound()

  const url = new URL(input.request.url)
  const html = renderListingBadgeHtml({
    siteName: input.site.name,
    listing,
    size: parseListingBadgeSize(url.searchParams.get("size")),
    theme: parseListingBadgeTheme(url.searchParams.get("theme")),
  })

  return response(html, 200, LISTING_BADGE_CACHE)
}

export function listingBadgeUnavailableResponse() {
  return response("Badge unavailable", 500, "no-store")
}
