import { notFound, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import {
  currentAddressFor,
  OLD_ADDRESS_KINDS,
  type OldAddressKind,
} from "@/server/directory/old-addresses"
import { visitorSite } from "@/server/directory/public"

/** The page whose on/off switch each kind's own pages follow. */
const PAGE_FOR_KIND: Record<OldAddressKind, string> = {
  listing: "/directory",
  event: "/events",
  post: "/posts",
  promotion: "/deals",
  guide: "/guides",
}

/**
 * Where an address a listing, event, post, deal or guide used to have leads
 * now.
 *
 * Public, because the old link is in somebody's bookmarks and Google's index.
 * It answers only while the kind's page is open to this visitor, and only with
 * an address whose record has a public page.
 */
const findCurrentAddressFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      kind: z.enum(OLD_ADDRESS_KINDS),
      slug: z.string().min(1).max(160),
    })
  )
  .handler(async ({ data }): Promise<string | null> => {
    const site = await visitorSite()
    if (!site) return null
    // The same switch the page itself follows. Anybody can call this door,
    // so a page that is off, or kept for members and asked by somebody
    // signed out, gives nothing away about where its records moved.
    const visibility = await readPageVisibility(site.id, PAGE_FOR_KIND[data.kind])
    if (visibility === "off") return null
    if (
      visibility === "members" &&
      !(await findCurrentUser().catch(() => null))
    ) {
      return null
    }
    return currentAddressFor(site.id, data.kind, data.slug)
  })

/**
 * What a public page does when its own read found nothing: forward to where
 * the address leads now, or show the page-not-found page.
 *
 * Called only after the miss, so a page that exists never asks. The forward is
 * a 301, the permanent kind, so a search engine swaps the old address for the
 * new one instead of keeping both.
 */
export async function forwardOldAddress(
  kind: OldAddressKind,
  slug: string
): Promise<never> {
  const current = await findCurrentAddressFn({ data: { kind, slug } })
  if (!current) throw notFound()
  const params = { slug: current }
  const statusCode = 301
  // A 301 with no caching rule is kept by a browser for good. Renaming the
  // record back, or deleting it, would then be invisible to anybody who had
  // followed the old link once, and a rename back would loop in their
  // browser. An hour is long enough for a crawler and short enough to undo.
  const headers = { "Cache-Control": "public, max-age=3600" }
  switch (kind) {
    case "listing":
      throw redirect({ to: "/directory/$slug", params, statusCode, headers })
    case "event":
      throw redirect({ to: "/events/$slug", params, statusCode, headers })
    case "post":
      throw redirect({ to: "/posts/$slug", params, statusCode, headers })
    case "promotion":
      throw redirect({ to: "/deals/$slug", params, statusCode, headers })
    case "guide":
      throw redirect({ to: "/guides/$slug", params, statusCode, headers })
  }
}
