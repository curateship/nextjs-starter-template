import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DIRECTORY_SORTS,
  type DirectorySort,
  type DirectorySuggestions,
  parseDirectoryNearPoint,
  readDirectoryCategories,
  readDirectoryMinRating,
  readDirectoryNearRadius,
} from "@/lib/directory/public-search"
import { findCurrentUser } from "@/server/auth/security"
import {
  readDirectoryMap,
  readDirectorySuggestions,
  readPublicBrowse,
  readPublicCategory,
  readPublicListing,
  visitorSite,
  type PublicBrowse,
  type PublicCategoryPage,
  type PublicDirectoryMap,
  type PublicListingCard,
  type PublicListingPage,
} from "@/server/directory/public"
import {
  fillFrontPageDeals,
  fillFrontPageEvents,
  fillFrontPagePosts,
  readDirectoryFrontPage,
} from "@/server/directory/front-page"
import type { DirectoryFrontPageAnswer } from "@/lib/directory/front-page"
import { answerForRequest } from "@/server/workspaces/host"
import { geocodeDirectoryPlace } from "@/server/directory/geocode"
import { requireAppOrigin, requestIp } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { timeZoneLabel, wallClockAt } from "@/lib/events/event-time"
import { siteTimeZone } from "@/server/directory/settings"
import { listedDealsAt, type ListedDeal } from "@/server/promotions/deal-view"
import {
  dealHeadlinesFor,
  dealsAccessFor,
  readListingDeals,
  readNewestDeals,
} from "@/server/promotions/public"
import {
  eventsAccessFor,
  readEventSuggestions,
  readUpcomingEvents,
  type PublicEventCard,
} from "@/server/events/public"
import { postsAccessFor } from "@/server/posts/cards"

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
/**
 * The ticked categories as one comma-separated value. Long enough for the
 * twelve slugs the address reader keeps, and no longer — a validator is the
 * cheapest place to stop somebody pasting a megabyte.
 */
const categoriesInput = z.string().max(2_000).optional()
const minRatingInput = z.number().optional()
const pageInput = z.number().int().min(1).max(10_000).optional()
const slugInput = z.string().min(1).max(160)

const readDirectoryBrowseFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      category: categoriesInput,
      minRating: minRatingInput,
      sort: sortInput,
      page: pageInput,
      near: z.string().max(40).optional(),
      place: z.string().max(120).optional(),
      radius: z.number().int().optional(),
    })
  )
  .handler(async ({ data }): Promise<PublicBrowse | null> => {
    const site = await visitorSite()
    if (!site) return null

    const browse = await readPublicBrowse(site, {
      search: data.search,
      // Read again on the server rather than trusted from the address: this
      // endpoint is a door of its own and anybody may knock on it.
      categories: readDirectoryCategories(data.category),
      minRating: readDirectoryMinRating(data.minRating),
      sort: data.sort,
      page: data.page ?? 1,
      near: parseDirectoryNearPoint(data.near) ?? undefined,
      radius: readDirectoryNearRadius(data.radius),
    })
    if (!browse) return null
    return { ...browse, listings: await withDealTags(site.id, browse.listings) }
  })

/** One page of a site's published listings, with the filters above them. */
export function loadDirectoryBrowse(input: {
  search?: string
  /** The ticked categories, comma separated, straight from the address. */
  category?: string
  minRating?: number
  sort?: DirectorySort
  page?: number
  near?: string
  place?: string
  radius?: number
}) {
  return readDirectoryBrowseFn({ data: input })
}

const readDirectoryMapFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      category: categoriesInput,
      minRating: minRatingInput,
      sort: sortInput,
      near: z.string().max(40).optional(),
      radius: z.number().int().optional(),
    })
  )
  .handler(async ({ data }): Promise<PublicDirectoryMap | null> => {
    const site = await visitorSite()
    if (!site) return null

    return readDirectoryMap(site, {
      search: data.search,
      categories: readDirectoryCategories(data.category),
      minRating: readDirectoryMinRating(data.minRating),
      sort: data.sort,
      near: parseDirectoryNearPoint(data.near) ?? undefined,
      radius: readDirectoryNearRadius(data.radius),
    })
  })

/**
 * The same filtered listings as the grid, as pins, with the site's own browser
 * map key. Null when this site does not offer a map or has no key for one.
 */
export function loadDirectoryMap(input: {
  search?: string
  category?: string
  minRating?: number
  sort?: DirectorySort
  near?: string
  radius?: number
}) {
  return readDirectoryMapFn({ data: input })
}

const readDirectorySuggestionsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ query: z.string().max(120) }))
  .handler(async ({ data }): Promise<DirectorySuggestions> => {
    // Empty lists rather than null or an error, every time this answers
    // nothing. A refused burst then leaves the visitor with a plain search box
    // for a minute instead of a message about a mistake they did not make.
    const nothing: DirectorySuggestions = {
      listings: [],
      categories: [],
      events: [],
    }

    const site = await visitorSite()
    if (!site) return nothing

    try {
      await enforceRateLimit(`directory-suggest:${requestIp()}`, {
        maxAttempts: 60,
        windowSeconds: 60,
      })
    } catch {
      return nothing
    }

    const [directory, events] = await Promise.all([
      readDirectorySuggestions(site.id, data.query),
      readEventSuggestions(site.id, data.query, new Date()),
    ])
    return { ...directory, events }
  })

/**
 * The few listings, categories and events the search box offers as somebody
 * types.
 */
export function loadDirectorySuggestions(query: string) {
  return readDirectorySuggestionsFn({ data: { query } })
}

const geocodeDirectoryPlaceFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().max(120) }))
  .handler(async ({ data }) => {
    requireAppOrigin()
    const site = await visitorSite()
    if (!site) {
      return {
        place: null,
        error:
          "Place search is not available on this site yet. Use your location instead.",
      }
    }
    return geocodeDirectoryPlace(site.id, data.query)
  })

/** The typed fallback when a visitor does not share browser location. */
export function findDirectoryPlace(query: string) {
  return geocodeDirectoryPlaceFn({ data: { query } })
}

/**
 * The site's wall clock when this visitor may see the Deals page, or null when
 * they may not, so nothing about deals is read for somebody the page is
 * closed to.
 */
async function dealsClockFor(
  siteId: string,
  isSignedIn: () => Promise<boolean>
): Promise<string | null> {
  const access = await dealsAccessFor(siteId, isSignedIn)
  if (!access) return null
  return wallClockAt(await siteTimeZone(siteId), new Date())
}

/**
 * The cards with their Deal tags, read after the page's cache in one query
 * for the whole page, never one per card. Unchanged while the Deals page is
 * closed to this visitor.
 */
async function withDealTags(
  siteId: string,
  listings: PublicListingCard[]
): Promise<PublicListingCard[]> {
  if (listings.length === 0) return listings
  const now = await dealsClockFor(siteId, async () =>
    Boolean(await findCurrentUser().catch(() => null))
  )
  if (!now) return listings
  const headlines = await dealHeadlinesFor(
    siteId,
    listings.map((listing) => listing.id),
    now
  )
  return listings.map((listing) => {
    const dealHeadline = headlines.get(listing.id)
    return dealHeadline ? { ...listing, dealHeadline } : listing
  })
}

/** How many upcoming events a listing's "What's on here" shows. */
const EVENTS_ON_A_LISTING = 3

/**
 * The next events held at a listing, for its "What's on here", or filed under
 * a category, for its page. Null when the visitor may not see the Events page.
 */
export type ListingEvents = {
  events: PublicEventCard[]
  /** Every upcoming event there, for "See all 5 events". */
  total: number
  /** "Eastern Time", the zone the times are in. */
  zone: string
}

const readDirectoryListingFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: slugInput }))
  .handler(async ({
    data,
  }): Promise<
    | (PublicListingPage & {
        whatsOn: ListingEvents | null
        /** "Deals here": its live deals, or null while Deals is closed to this visitor. */
        dealsHere: ListedDeal[] | null
      })
    | null
  > => {
    const site = await visitorSite()
    if (!site) return null

    // Who is reading, when they happen to be signed in. Read on the server from
    // the session, never sent by the page — and used only to tell somebody
    // where their *own* claim stands. A signed-out visitor gets the same page
    // with nothing personal in it.
    const viewer = await findCurrentUser().catch(() => null)

    const page = await readPublicListing(site, data.slug, {
      viewerId: viewer?.id ?? null,
    })
    if (!page) return null

    // Read after the listing's two-minute cache, by the site's clock, and only
    // when this visitor may see the Deals page, the switch every deal follows.
    const dealsNow = await dealsClockFor(site.id, async () => Boolean(viewer))
    const dealsHere = dealsNow
      ? listedDealsAt(
          await readListingDeals(site, page.listing.id, dealsNow),
          dealsNow
        )
      : null

    // The same for events, with the Events page's own switch.
    const access = await eventsAccessFor(site.id, async () => Boolean(viewer))
    if (!access) return { ...page, whatsOn: null, dealsHere }
    const timeZone = await siteTimeZone(site.id)
    const upcoming = await readUpcomingEvents(
      site,
      1,
      wallClockAt(timeZone, new Date()),
      undefined,
      { placeId: page.listing.id }
    )
    return {
      ...page,
      dealsHere,
      whatsOn: {
        events: upcoming.events.slice(0, EVENTS_ON_A_LISTING),
        total: upcoming.total,
        zone: timeZoneLabel(timeZone),
      },
    }
  })

/** One published listing by its address, or null if there is not one. */
export function loadDirectoryListing(slug: string) {
  return readDirectoryListingFn({ data: { slug } })
}

/** How many live deals a category page shows above its listings. */
const DEALS_ON_A_CATEGORY = 6

/** How many upcoming events a category page shows under its listings. */
const EVENTS_ON_A_CATEGORY = 6

const readDirectoryCategoryFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      slug: slugInput,
      page: pageInput,
      category: categoriesInput,
      minRating: minRatingInput,
    })
  )
  .handler(async ({
    data,
  }): Promise<
    | (PublicCategoryPage & {
        upcomingEvents: ListingEvents | null
        /** The newest live deals at its listings, on its first page only. */
        categoryDeals: ListedDeal[]
      })
    | null
  > => {
    const site = await visitorSite()
    if (!site) return null

    const cached = await readPublicCategory(site, data.slug, {
      page: data.page ?? 1,
      categories: readDirectoryCategories(data.category),
      minRating: readDirectoryMinRating(data.minRating),
    })
    if (!cached) return null
    const isSignedIn = async () =>
      Boolean(await findCurrentUser().catch(() => null))
    const dealsNow =
      (data.page ?? 1) === 1 ? await dealsClockFor(site.id, isSignedIn) : null
    const page = {
      ...cached,
      listings: await withDealTags(site.id, cached.listings),
      categoryDeals: dealsNow
        ? listedDealsAt(
            await readNewestDeals(site, dealsNow, {
              categoryId: cached.category.id,
              limit: DEALS_ON_A_CATEGORY,
            }),
            dealsNow
          )
        : [],
    }

    // Read after the category's cache, by the site's clock, and only when this
    // visitor may see the Events page, the same as a listing's "What's on
    // here".
    const access = await eventsAccessFor(site.id, isSignedIn)
    if (!access) return { ...page, upcomingEvents: null }
    const timeZone = await siteTimeZone(site.id)
    const upcoming = await readUpcomingEvents(
      site,
      1,
      wallClockAt(timeZone, new Date()),
      undefined,
      { categoryId: page.category.id }
    )
    return {
      ...page,
      upcomingEvents: {
        events: upcoming.events.slice(0, EVENTS_ON_A_CATEGORY),
        total: upcoming.total,
        zone: timeZoneLabel(timeZone),
      },
    }
  })

/** One category, its subcategories and one page of its listings. */
export function loadDirectoryCategory(input: {
  slug: string
  page?: number
  category?: string
  minRating?: number
}) {
  return readDirectoryCategoryFn({ data: input })
}

const readDirectoryFrontPageFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryFrontPageAnswer> => {
    const answer = await answerForRequest()
    // The platform's own address is not a site, and its root belongs to
    // whoever runs it. Every other host falls through as "site", an address
    // nobody has taken included, so it keeps behaving exactly as it did.
    if (answer.kind === "platform") {
      return {
        host: "platform",
        signedIn: Boolean(await findCurrentUser().catch(() => null)),
      }
    }
    if (answer.kind !== "workspace") return { host: "site", page: null }

    const page = await readDirectoryFrontPage({
      id: answer.workspace.id,
      name: answer.workspace.name,
    })
    if (!page) return { host: "site", page: null }
    const hasEvents = page.rows.some((row) => row.kind === "events")
    const hasDeals = page.rows.some((row) => row.kind === "deals")
    const hasPosts = page.rows.some((row) => row.kind === "posts")
    if (!hasEvents && !hasDeals && !hasPosts) return { host: "site", page }

    // A row of events follows the Events page's own switch, a row of deals the
    // Deals page's, and a row of posts the Posts page's, for this visitor.
    // Every card on each of them leads to that page.
    const site = await visitorSite()
    if (!site) return { host: "site", page: null }
    const isSignedIn = async () =>
      Boolean(await findCurrentUser().catch(() => null))
    const withEvents = hasEvents
      ? await fillFrontPageEvents(
          site,
          page,
          (await eventsAccessFor(site.id, isSignedIn)) !== null
        )
      : page
    if (!withEvents) return { host: "site", page: null }
    const withDeals = hasDeals
      ? await fillFrontPageDeals(
          site,
          withEvents,
          (await dealsAccessFor(site.id, isSignedIn)) !== null
        )
      : withEvents
    if (!withDeals || !hasPosts) {
      return { host: "site", page: withDeals ?? null }
    }
    return {
      host: "site",
      page: await fillFrontPagePosts(
        site,
        withDeals,
        (await postsAccessFor(site.id, isSignedIn)) !== null
      ),
    }
  }
)

/**
 * What `/` is for the host that asked: the visited site's home page, or the
 * word that this is the platform's own address and who is reading it.
 */
export function loadDirectoryFrontPage() {
  return readDirectoryFrontPageFn()
}

/**
 * The two shapes a component names out loud. Everything else a page needs is
 * inferred from its loader, so re-exporting the rest would be a list to keep in
 * step with nothing reading it.
 */
export type { DirectoryFrontPageAnswer } from "@/lib/directory/front-page"
export type {
  PublicCategory,
  PublicClaimState,
  PublicDirectoryMap,
  PublicListingCard,
  PublicMapPin,
} from "@/server/directory/public"
export type { DirectoryFrontPageData } from "@/lib/directory/front-page"
