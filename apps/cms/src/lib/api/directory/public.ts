import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DIRECTORY_SORTS,
  type DirectorySort,
} from "@/lib/directory/public-search"
import {
  readPublicBrowse,
  readPublicCategory,
  readPublicListing,
  visitorSite,
  type PublicBrowse,
  type PublicCategoryPage,
  type PublicListingPage,
} from "@/server/directory/public"

import { createErrorMessage } from "../error-message"

/**
 * The visitor-facing directory's three doors.
 *
 * **None of them carries a guard, and that is the point** — a public page that
 * needs a session to load is not a public page. Each is written down in
 * `src/app/open-endpoints.ts` with the reason, which is the only way an
 * unguarded endpoint ships.
 *
 * Because anybody may call these, each decides for itself what may come back
 * rather than handing rows over and leaving the filtering to a route:
 *
 * - the site is read from the Host header **on the server**, never from the
 *   request body, so nobody can ask for a site they are not visiting;
 * - only published listings are ever selected, so a draft is missing rather
 *   than hidden.
 *
 * Null means "nothing here" for every reason at once — no site at this
 * address, no listing at that address, a draft, or another site's — and the
 * routes turn it into the same not-found page in every case.
 */

/**
 * Why a public page could not load.
 *
 * Deliberately one flat sentence, unlike the admin's mappers beside it. Those
 * pass the server's own words straight through, which is right for somebody
 * who just typed the thing being complained about ("Another listing already
 * uses the address joes-diner") and wrong for a stranger reading a website —
 * a database failure would otherwise be shown to a visitor word for word.
 */
export const getPublicDirectoryErrorMessage = createErrorMessage(
  {},
  "This page could not be loaded. Please try again."
)

const sortInput = z.enum(DIRECTORY_SORTS).optional()
const pageInput = z.number().int().min(1).max(10_000).optional()
const slugInput = z.string().min(1).max(160)

const readDirectoryBrowseFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      category: z.string().max(160).optional(),
      sort: sortInput,
      page: pageInput,
    })
  )
  .handler(async ({ data }): Promise<PublicBrowse | null> => {
    const site = await visitorSite()
    if (!site) return null

    return readPublicBrowse(site, {
      search: data.search,
      category: data.category,
      sort: data.sort ?? "order",
      page: data.page ?? 1,
    })
  })

/** One page of a site's published listings, with the filters above them. */
export function loadDirectoryBrowse(input: {
  search?: string
  category?: string
  sort?: DirectorySort
  page?: number
}) {
  return readDirectoryBrowseFn({ data: input })
}

const readDirectoryListingFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: slugInput }))
  .handler(async ({ data }): Promise<PublicListingPage | null> => {
    const site = await visitorSite()
    if (!site) return null

    return readPublicListing(site, data.slug)
  })

/** One published listing by its address, or null if there is not one. */
export function loadDirectoryListing(slug: string) {
  return readDirectoryListingFn({ data: { slug } })
}

const readDirectoryCategoryFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: slugInput, page: pageInput }))
  .handler(async ({ data }): Promise<PublicCategoryPage | null> => {
    const site = await visitorSite()
    if (!site) return null

    return readPublicCategory(site, data.slug, { page: data.page ?? 1 })
  })

/** One category, its subcategories and one page of its listings. */
export function loadDirectoryCategory(input: { slug: string; page?: number }) {
  return readDirectoryCategoryFn({ data: input })
}

/**
 * The two shapes a component names out loud. Everything else a page needs is
 * inferred from its loader, so re-exporting the rest would be a list to keep in
 * step with nothing reading it.
 */
export type {
  PublicCategory,
  PublicListingCard,
} from "@/server/directory/public"
