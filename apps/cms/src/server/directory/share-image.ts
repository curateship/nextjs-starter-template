import { and, asc, desc, eq } from "drizzle-orm"

import {
  listingShareImagePath,
  listingShareImageVersion,
  renderListingShareImage,
} from "@/lib/directory/listing-share-image"
import { slugProblem } from "@/lib/directory/slugs"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { db, type CustomShellDb } from "@/server/db"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import type { VisitorSite } from "@/server/directory/public"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"

export const LISTING_SHARE_IMAGE_CACHE = "public, max-age=31536000, immutable"
export const LISTING_SHARE_IMAGE_NOT_FOUND_CACHE =
  "public, max-age=60, s-maxage=300"

const IMAGE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'none'; sandbox",
}

type DrawShareImage = typeof renderListingShareImage

function imageResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      ...IMAGE_HEADERS,
      "Cache-Control": LISTING_SHARE_IMAGE_CACHE,
    },
  })
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": LISTING_SHARE_IMAGE_NOT_FOUND_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function drawPublishedListing(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb,
  draw: DrawShareImage
) {
  const [listing] = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      updatedAt: directoryListings.updatedAt,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, site.id),
        eq(directoryListings.slug, slug),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!listing) return null

  const [category] = await database
    .select({ name: categories.name })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, site.id),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.contentId, listing.id)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))
    .limit(1)

  const input = {
    title: listing.title,
    category: category?.name ?? null,
    siteName: site.name,
    accentColor: site.accentColor ?? "",
    updatedAt: listing.updatedAt,
  }
  return {
    svg: draw(input),
    version: listingShareImageVersion(input),
  }
}

/** The public route's testable work, kept separate from request-host lookup. */
export async function listingShareImageResponse(input: {
  request: Request
  site: VisitorSite | null
  slug: string
  requestAddress: string
  database?: CustomShellDb
  limit?: typeof enforceRateLimit
  draw?: DrawShareImage
}): Promise<Response> {
  if (!input.site || input.slug.length > 160 || slugProblem(input.slug)) {
    return notFound()
  }

  const database = input.database ?? db
  const limit = input.limit ?? enforceRateLimit
  try {
    await limit(
      `directory-listing-share-image:${input.site.id}:${input.requestAddress}`,
      { maxAttempts: 120, windowSeconds: 60 },
      database
    )
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return new Response("Too many requests", {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      })
    }
    throw error
  }

  const site = input.site
  const drawn = await cachedPublicDirectoryRead(
    site.id,
    "listing-share-image",
    {
      slug: input.slug,
      siteName: site.name,
      accentColor: site.accentColor ?? "",
    },
    () =>
      drawPublishedListing(
        site,
        input.slug,
        database,
        input.draw ?? renderListingShareImage
      )
  )
  if (!drawn) return notFound()

  const requestedVersion = new URL(input.request.url).searchParams.get("v")
  if (requestedVersion !== drawn.version) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: listingShareImagePath(input.slug, drawn.version),
        "Cache-Control": LISTING_SHARE_IMAGE_NOT_FOUND_CACHE,
      },
    })
  }

  return imageResponse(drawn.svg)
}

export function listingShareImageUnavailableResponse(): Response {
  return new Response("Share image unavailable", {
    status: 500,
    headers: { "Cache-Control": "no-store" },
  })
}
