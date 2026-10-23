import {
  listingShareImageVersion,
  renderListingShareImage,
} from "@/lib/directory/listing-share-image"
import { guideShareImagePath } from "@/lib/directory/guides"
import type { enforceRateLimit } from "@/server/auth/rate-limit"
import type { CustomShellDb } from "@/server/db"
import { guideShareInputFor } from "@/server/directory/guides"
import type { VisitorSite } from "@/server/directory/public"
import {
  publicShareImageResponse,
  type DrawShareImage,
} from "@/server/directory/share-image"

/**
 * The drawn share card for a guide with no cover, at
 * /guides/share-image/<address>: the listing card with "Guide · 9 places"
 * where a listing's card shows its category.
 *
 * Drawn only while the Guides page is open to everyone, like the feed and the
 * sitemap: a card is fetched by a link preview that is never signed in.
 */
export function guideShareImageResponse(input: {
  request: Request
  site: VisitorSite | null
  slug: string
  requestAddress: string
  database?: CustomShellDb
  limit?: typeof enforceRateLimit
  draw?: DrawShareImage
}): Promise<Response> {
  const draw = input.draw ?? renderListingShareImage
  return publicShareImageResponse({
    ...input,
    kind: "guide",
    path: guideShareImagePath,
    read: async (site, slug, database) => {
      const card = await guideShareInputFor(site, slug, database)
      return card
        ? { svg: draw(card), version: listingShareImageVersion(card) }
        : null
    },
  })
}
