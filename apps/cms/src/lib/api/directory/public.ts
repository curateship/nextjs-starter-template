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
import type { DirectoryFrontPageAnswer } from "@/lib/directory/front-page"
import {
  DIRECTORY_DEAL_FILTERS,
  type DirectoryDealFilter,
} from "@/lib/directory/listing-map"
import { answerForRequest } from "@/server/workspaces/host"
import { geocodeDirectoryPlace } from "@/server/directory/geocode"
import { requireAppOrigin, requestIp } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { timeZoneLabel, wallClockAt } from "@/lib/events/event-time"
import { siteTimeZone } from "@/server/directory/settings"
import { listedDealsAt, type ListedDeal } from "@/server/promotions/deal-view"
import { isFollowing } from "@/server/promotions/follows"
import {
  dealHeadlinesFor,
  dealsAccessFor,
  listingHasDealOn,
  readListingDeals,
  readNewestDeals,
} from "@/server/promotions/public"
import {
  eventsAccessFor,
  readEventSuggestions,
  readUpcomingEvents,
  type PublicEventCard,
} from "@/server/events/public"

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
    // Nothing to tag means nothing to ask about: a search with no results reads
    // no deals clock, which is what it did before the tags existed.
    const dealsNow = browse.listings.length
      ? await dealsClockFor(site.id, someoneIsSignedIn)
      : null
    return {
      ...browse,
      listings: await withDealTags(site.id, browse.listings, dealsNow),
    }
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

/**
 * The map, plus the one thing only the server can answer about its deals.
 *
 * `dealsSwitch` is whether this visitor may see deals at all. The page needs it
 * to decide whether to draw the "Deals only" switch, and a switch that is drawn
 * where it can change nothing is worse than no switch.
 */
type DirectoryMapAnswer = PublicDirectoryMap & {
  dealsSwitch: boolean
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
      deals: z.enum(DIRECTORY_DEAL_FILTERS).optional(),
    })
  )
  .handler(async ({ data }): Promise<DirectoryMapAnswer | null> => {
    const site = await visitorSite()
    if (!site) return null

    // The site's clock, or null while the Deals page is closed to this visitor.
    // Null means no deal markers and no "Deals only": a hand-edited
    // `?deals=only` on a site that keeps its deals for members draws the whole
    // map, which is the same map that address showed before deals existed.
    const dealsNow = await dealsClockFor(site.id, someoneIsSignedIn)

    const map = await readDirectoryMap(site, {
      search: data.search,
      categories: readDirectoryCategories(data.category),
      minRating: readDirectoryMinRating(data.minRating),
      sort: data.sort,
      near: parseDirectoryNearPoint(data.near) ?? undefined,
      radius: readDirectoryNearRadius(data.radius),
      dealsOn:
        data.deals === "only" && dealsNow
          ? { now: dealsNow, where: listingHasDealOn(site.id, dealsNow) }
          : undefined,
    })
    if (!map) return null

    return {
      ...map,
      dealsSwitch: Boolean(dealsNow),
      pins: await withDealTags(site.id, map.pins, dealsNow),
    }
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
  /** "only" leaves out every listing with no deal on. */
  deals?: DirectoryDealFilter
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
 * for the whole page, never one per card. Unchanged when `now` is null, which
 * is how a visitor the Deals page is closed to sees no tags at all.
 *
 * Generic over the card, because a map pin is a card with two numbers on it
 * and it needs the same tag to draw its deal marker.
 */
async function withDealTags<Card extends PublicListingCard>(
  siteId: string,
  listings: Card[],
  now: string | null
): Promise<Card[]> {
  if (!now || listings.length === 0) return listings
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

/** Where the Follow button on a listing's page starts. */
export type ListingFollowState = {
  signedIn: boolean
  following: boolean
}

/** Whether anybody is signed in on this request, for the deals switch. */
const someoneIsSignedIn = async () =>
  Boolean(await findCurrentUser().catch(() => null))

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
  .handler(
    async ({
      data,
    }): Promise<
      | (PublicListingPage & {
          whatsOn: ListingEvents | null
          /** "Deals here": its live deals, or null while Deals is closed to this visitor. */
          dealsHere: ListedDeal[] | null
          /** The Follow button, or null while Deals is closed to this visitor. */
          follow: ListingFollowState | null
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
      // Whether this person follows the listing, read here rather than cached
      // with the page, so the button is right after a reload.
      const follow: ListingFollowState | null = dealsNow
        ? {
            signedIn: Boolean(viewer),
            following: viewer
              ? await isFollowing(site.id, viewer.id, page.listing.id)
              : false,
          }
        : null

      // The same for events, with the Events page's own switch.
      const access = await eventsAccessFor(site.id, async () => Boolean(viewer))
      if (!access) return { ...page, whatsOn: null, dealsHere, follow }
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
        follow,
        whatsOn: {
          events: upcoming.events.slice(0, EVENTS_ON_A_LISTING),
          total: upcoming.total,
          zone: timeZoneLabel(timeZone),
        },
      }
    }
  )

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
  .handler(
    async ({
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
      // One clock for the page. The row of deals above the listings is first
      // page only; the tags on the cards are every page, so the clock cannot be
      // the thing that decides which.
      const dealsNow = await dealsClockFor(site.id, someoneIsSignedIn)
      const categoryDealsNow = (data.page ?? 1) === 1 ? dealsNow : null
      const page = {
        ...cached,
        listings: await withDealTags(site.id, cached.listings, dealsNow),
        categoryDeals: categoryDealsNow
          ? listedDealsAt(
              await readNewestDeals(site, categoryDealsNow, {
                categoryId: cached.category.id,
                limit: DEALS_ON_A_CATEGORY,
              }),
              categoryDealsNow
            )
          : [],
      }

      // Read after the category's cache, by the site's clock, and only when this
      // visitor may see the Events page, the same as a listing's "What's on
      // here".
      const access = await eventsAccessFor(site.id, someoneIsSignedIn)
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
    }
  )

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
    // whoever runs it. Every other host answers "site", an address nobody has
    // taken included, so it keeps behaving exactly as it did.
    if (answer.kind === "platform") {
      return {
        host: "platform",
        signedIn: Boolean(await findCurrentUser().catch(() => null)),
      }
    }
    return { host: "site" }
  }
)

/**
 * Which of the two `/` is for the host that asked: one of this deployment's
 * sites, whose front page the shell draws from that site's own rows, or the
 * platform's own address, which forwards and carries whether the reader is
 * signed in.
 *
 * It answered a whole home page until 27 Sep 2026, when CMS's rows moved onto
 * the shell's front page builder. `page` is always null now and is kept so the
 * answer still says which of the two a host is.
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
