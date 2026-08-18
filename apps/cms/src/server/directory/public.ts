import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
} from "drizzle-orm"
import { getRequestHeader } from "@tanstack/react-start/server"

import type { ContactLinks } from "@/lib/directory/contact-links"
import { cleanContactLinks } from "@/lib/directory/contact-links"
import {
  cleanListingCoordinates,
  cleanListingGallery,
  cleanListingHours,
  type ListingHours,
} from "@/lib/directory/listing-details"
import {
  cleanCustomValues,
  customSectionsForDisplay,
  type CustomSectionView,
} from "@/lib/directory/custom-fields"
import {
  RELATED_LISTING_COUNT,
  DEFAULT_DIRECTORY_NEAR_RADIUS_KM,
  type DirectorySort,
  type DirectoryNearPoint,
} from "@/lib/directory/public-search"
import {
  cleanWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import { appUrl } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { claimedListingIds, claimStateFor } from "@/server/directory/claims"
import {
  activeFeaturedForListings,
  featuredPriorityFor,
} from "@/server/directory/featured"
import { listCustomSections } from "@/server/directory/custom-sections"
import {
  publishedSubtreeCounts,
  readDirectoryCategoryCards,
  resolvedCategoryChoice,
} from "@/server/directory/category-cards"
import {
  directoryMapDisplayKey,
  directorySettingsFor,
} from "@/server/directory/settings"
import { DIRECTORY_MAP_LISTING_LIMIT } from "@/lib/directory/listing-map"
import {
  MAX_DIRECTORY_CATEGORY_CARDS,
  type DirectoryCategoryCard,
} from "@/lib/directory/category-cards"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import type { ReviewStatus } from "@/lib/directory/review-status"
import { customShellWorkspaces } from "@/server/schema"
import { parseWorkspaceSettings } from "@/server/people/workspaces"
import { listingShareImageVersion } from "@/lib/directory/listing-share-image"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"

/**
 * What a visitor is allowed to read.
 *
 * Every read here takes the site as its first argument and filters on it, the
 * same as the admin's reads — and adds the one rule the admin's do not: **only
 * published listings**. A draft is not "hidden from the list", it is not
 * readable at all, by its address or by any other route into this file.
 *
 * The site is never a value the browser sends. It comes from
 * `visitorSite()` below, which asks the shell's one answer, which reads the
 * Host header on the server. A site id in a request body would let anybody ask
 * for any site's content — including a switched-off one.
 */

/** The site a public directory page is being drawn for. */
export type VisitorSite = {
  id: string
  name: string
  /** The site's public accent, used when a listing needs a drawn share card. */
  accentColor?: string
  /**
   * Where this site lives, built from the address actually being answered —
   * `https://alpha.example.com`, never the deployment's own address.
   *
   * It matters because it goes into the page's JSON-LD, and a search engine
   * told that Alpha's listing lives on the platform's domain would index the
   * wrong address.
   */
  url: string
}

/**
 * The address being answered, as a bare origin.
 *
 * Read on the server from the request, like everything else about the host.
 * Outside a request — a script, a test — there is no host, and the
 * deployment's own address is the truthful answer.
 */
function requestOrigin(): string {
  let host: string | null = null
  let forwarded: string | null = null
  try {
    host = getRequestHeader("host") ?? null
    forwarded = getRequestHeader("x-forwarded-proto") ?? null
  } catch {
    host = null
  }
  if (!host) return appUrl()

  // Behind a proxy the app itself speaks http while the visitor typed https,
  // so the proxy's word beats ours. With no proxy, whatever the deployment
  // says about itself.
  const scheme = forwarded?.split(",")[0]?.trim()
  if (scheme === "http" || scheme === "https") return `${scheme}://${host}`

  try {
    return `${new URL(appUrl()).protocol}//${host}`
  } catch {
    return `https://${host}`
  }
}

/** The site whose address the visitor typed, or null when there is none. */
export async function visitorSite(
  database: CustomShellDb = db
): Promise<VisitorSite | null> {
  // The shell's one answer, so a public directory page and a public written
  // page can never disagree about which site they are on.
  const id = await visitorWorkspaceId(database)
  if (!id) return null

  const [row] = await database
    .select({
      id: customShellWorkspaces.id,
      name: customShellWorkspaces.name,
      settings: customShellWorkspaces.settings,
    })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, id))
    .limit(1)

  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    accentColor: parseWorkspaceSettings(row.settings).accentColor,
    url: requestOrigin(),
  }
}

/** What a page is told about the site it is drawing. Never its id. */
export type PublicSite = { name: string; url: string }

/** One listing as a card in a grid: enough to draw it, and nothing more. */
export type PublicListingCard = {
  id: string
  title: string
  slug: string
  metaDescription: string
  rating: number | null
  featuredImage: string
  /** The primary category if it has one, else the first it is in. */
  category: PublicCategoryLink | null
  /**
   * The business itself looks after this page. Says nothing about who they are
   * — a visitor is told the page is looked after, never by whom.
   */
  claimed: boolean
  /** A paid placement that is active at the moment this row is read. */
  featured: boolean
  /** Present only while the visitor has asked for nearby listings. */
  distanceKm?: number | null
}

/** A category as a link: the two fields anything pointing at one needs. */
export type PublicCategoryLink = {
  name: string
  slug: string
}

/** A category with everything a chip or a child tile shows. */
export type PublicCategory = {
  id: string
  name: string
  slug: string
  description: string
  metaDescription: string
  featuredImage: string
  parentId: string | null
  /** Published listings in this category itself, not its children's. */
  listingCount: number
}

export type PublicListing = {
  id: string
  title: string
  slug: string
  metaDescription: string
  rating: number | null
  featuredImage: string
  gallery: string[]
  hours: ListingHours
  latitude: number | null
  longitude: number | null
  contactLinks: ContactLinks
  body: WrittenPageNode
  /**
   * The fields this site invented, already put together with this listing's
   * answers and with everything blank left out — so the page has nothing to
   * decide and nothing empty to draw.
   */
  customSections: CustomSectionView[]
  updatedAt: Date
  createdAt: Date
  featured: boolean
}

/** One page of the browse list, plus the filters the toolbar draws. */
export type PublicBrowse = {
  site: PublicSite
  listings: PublicListingCard[]
  total: number
  page: number
  pageSize: number
  categories: PublicCategory[]
  browseTitle: string
  browseIntro: string
  sort: DirectorySort
  /**
   * The row of category cards at the top of the page, or empty when this site
   * has not switched one on — and also when it has, but every category it chose
   * is empty. A heading over no cards is worse than no row.
   */
  categoryCards: DirectoryCategoryCard[]
  /**
   * This site both offers the map and has a key to draw it with. Half of that
   * is not a map: a site that switched the view on and never pasted a key gets
   * no button rather than a grey square.
   */
  mapAvailable: boolean
}

/** One listing as a pin: a grid card, plus the two numbers that place it. */
export type PublicMapPin = PublicListingCard & {
  latitude: number
  longitude: number
}

/** Everything the map view draws, for the filters the visitor has applied. */
export type PublicDirectoryMap = {
  /** The site's own browser key. Public by design, and only ever this one. */
  apiKey: string
  pins: PublicMapPin[]
  /**
   * Matching listings that have a location at all, before the cap. Bigger than
   * `pins.length` is exactly when the visitor has to be told something is
   * missing.
   */
  total: number
}

/**
 * Everything the claim button on a listing's page needs to draw itself.
 *
 * The wording travels with it rather than being fetched separately, because the
 * button and its message are one decision — a page that had the button but not
 * the sentence under it would be the setting half applied.
 */
export type PublicClaimState = {
  /** This site offers claiming at all. */
  enabled: boolean
  /**
   * Whether the reader has an account, so the page can offer sign-in rather
   * than a form that would refuse them at the end.
   *
   * A plain yes or no, never the id. The page has no use for who they are, and
   * a public page is not a place to put one.
   */
  signedIn: boolean
  /** Somebody already looks after it. Never says who. */
  claimed: boolean
  /** Where the reader's own claim stands, when they have made one. */
  mine: ReviewStatus | null
  buttonLabel: string
  pendingMessage: string
  approvedMessage: string
}

export type PublicListingPage = {
  site: PublicSite
  listing: PublicListing
  shareImageVersion: string
  categories: PublicCategoryLink[]
  primaryCategory: PublicCategoryLink | null
  related: PublicListingCard[]
  claim: PublicClaimState
}

export type PublicCategoryPage = {
  site: PublicSite
  category: PublicCategory
  /** Home → … → this one, for the breadcrumb. Ends with the category itself. */
  ancestors: PublicCategoryLink[]
  children: PublicCategory[]
  listings: PublicListingCard[]
  total: number
  page: number
  pageSize: number
  browseTitle: string
}

/** Published, on this site. The whole of what a visitor may see. */
function publishedOnSite(siteId: string) {
  return and(
    eq(directoryListings.workspaceId, siteId),
    eq(directoryListings.status, "published")
  )
}

/** Published listing results contributed to the shell's whole-site search. */
export async function directorySearchResults(
  siteId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []

  const pattern = siteSearchPattern(query)
  const rows = await database
    .select({
      title: directoryListings.title,
      slug: directoryListings.slug,
      metaDescription: directoryListings.metaDescription,
    })
    .from(directoryListings)
    .where(
      and(
        publishedOnSite(siteId),
        or(
          ilike(directoryListings.title, pattern),
          ilike(directoryListings.metaDescription, pattern)
        )
      )
    )
    .orderBy(
      desc(ilike(directoryListings.title, pattern)),
      asc(directoryListings.title),
      asc(directoryListings.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    type: "Listing",
    title: row.title,
    snippet: searchSnippet(row.metaDescription, query),
    path: `/directory/${row.slug}`,
  }))
}

function orderFor(
  sort: DirectorySort,
  workspaceId: string,
  featuredFirst: boolean
) {
  // When this site asks for it, paid placement leads whatever ordinary order
  // the visitor chooses. Expired placement immediately falls back to the
  // ordinary order below without a cleanup job.
  const featured = featuredFirst ? [desc(featuredPriorityFor(workspaceId))] : []
  // The id breaks every tie, so a page boundary cannot land mid-tie and show
  // the same listing twice or skip one.
  switch (sort) {
    case "newest":
      return [
        ...featured,
        desc(directoryListings.createdAt),
        asc(directoryListings.id),
      ]
    case "title":
      return [
        ...featured,
        asc(directoryListings.title),
        asc(directoryListings.id),
      ]
    case "order":
      return [
        ...featured,
        asc(directoryListings.displayOrder),
        desc(directoryListings.createdAt),
        asc(directoryListings.id),
      ]
    case "distance":
      return [asc(directoryListings.id)]
  }
}

/**
 * The category each of these listings is shown under: its primary one, or the
 * first by name when nobody marked one.
 *
 * One query for the whole page rather than one per card — twelve cards used to
 * mean twelve round trips, and the page only ever holds one page of them.
 */
async function categoryForCards(
  siteId: string,
  listingIds: string[],
  database: CustomShellDb
): Promise<Map<string, PublicCategoryLink>> {
  if (listingIds.length === 0) return new Map()

  const rows = await database
    .select({
      contentId: categoryRelationships.contentId,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.contentId, listingIds)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const found = new Map<string, PublicCategoryLink>()
  for (const row of rows) {
    // Primary first in the sort, so the first row wins and the rest are the
    // listing's other categories.
    if (!found.has(row.contentId)) {
      found.set(row.contentId, { name: row.name, slug: row.slug })
    }
  }
  return found
}

/**
 * Generic in the row on purpose. The map's rows carry a latitude and longitude
 * the grid's do not, and a fixed row type here would drop them from the result
 * type while `...row` kept them at runtime — a lie the compiler could not see.
 */
async function toCards<
  Row extends {
    id: string
    title: string
    slug: string
    metaDescription: string
    rating: number | null
    featuredImage: string
    distanceKm?: number | null
  },
>(
  siteId: string,
  rows: Row[],
  database: CustomShellDb
): Promise<(Row & PublicListingCard)[]> {
  const ids = rows.map((row) => row.id)
  // Both for the whole page at once. One query each rather than one per card:
  // twelve cards used to mean twelve round trips for the category alone.
  const [shownUnder, claimed, featured] = await Promise.all([
    categoryForCards(siteId, ids, database),
    claimedListingIds(siteId, ids, database),
    activeFeaturedForListings(siteId, ids, database),
  ])
  return rows.map((row) => ({
    ...row,
    category: shownUnder.get(row.id) ?? null,
    claimed: claimed.has(row.id),
    featured: featured.has(row.id),
  }))
}

/** Published cards from this site, returned in the caller's requested order. */
export async function publicListingCardsByIds(
  siteId: string,
  listingIds: string[],
  database: CustomShellDb = db
): Promise<PublicListingCard[]> {
  const uniqueIds = [...new Set(listingIds)]
  if (uniqueIds.length === 0) return []

  const rows = await database
    .select(cardColumns)
    .from(directoryListings)
    .where(
      and(publishedOnSite(siteId), inArray(directoryListings.id, uniqueIds))
    )
  const cards = await toCards(siteId, rows, database)
  const byId = new Map(cards.map((card) => [card.id, card]))

  return uniqueIds.flatMap((id) => {
    const card = byId.get(id)
    return card ? [card] : []
  })
}

/** The columns a card needs, so a grid never fetches a listing's whole body. */
const cardColumns = {
  id: directoryListings.id,
  title: directoryListings.title,
  slug: directoryListings.slug,
  metaDescription: directoryListings.metaDescription,
  rating: directoryListings.rating,
  featuredImage: directoryListings.featuredImage,
}

/**
 * Every category on this site that has something published in it, with how
 * many. A category holding only drafts is not shown: a visitor clicking it
 * would land on an empty page and reasonably think the site was broken.
 */
export async function publicCategories(
  siteId: string,
  database: CustomShellDb = db
): Promise<PublicCategory[]> {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, siteId))
      .orderBy(asc(categories.displayOrder), asc(categories.name)),
    database
      .select({
        categoryId: categoryRelationships.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(categoryRelationships)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, categoryRelationships.contentId)
      )
      .where(
        and(
          eq(categoryRelationships.workspaceId, siteId),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
          publishedOnSite(siteId)
        )
      )
      .groupBy(categoryRelationships.categoryId),
  ])

  const countFor = new Map(counts.map((row) => [row.categoryId, row.count]))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    metaDescription: row.metaDescription,
    featuredImage: row.featuredImage,
    parentId: row.parentId ?? null,
    listingCount: countFor.get(row.id) ?? 0,
  }))
}

/**
 * One category's id from its address, or nothing.
 *
 * Deliberately not `publicCategories`, which counts the published listings in
 * every category on the site — a join and a group-by over the whole table for a
 * page that only wants to know what one slug means.
 */
async function categoryIdForSlug(
  siteId: string,
  slug: string,
  database: CustomShellDb
): Promise<string | undefined> {
  const [row] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.workspaceId, siteId), eq(categories.slug, slug)))
    .limit(1)
  return row?.id
}

/**
 * The ids of the listings in one category.
 *
 * **This category only, never its children.** That is what the directory app
 * does, and rolling children up would mean a listing appearing on a page it
 * was never put on.
 */
function listingIdsInCategory(
  siteId: string,
  categoryId: string,
  database: CustomShellDb
) {
  return database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.categoryId, categoryId)
      )
    )
}

/**
 * What a visitor has narrowed the list to: the same search, the same category
 * and the same location for every way of drawing it.
 *
 * One place rather than two because the grid and the map show *the same
 * results*. Written twice they would drift, and a map quietly showing a
 * different set from the grid beside it is the worst version of this feature.
 */
type BrowseQuery = {
  search?: string
  categoryId?: string
  sort: DirectorySort
  featuredFirst: boolean
  near?: DirectoryNearPoint
  radius?: number
}

function browseQuery(
  siteId: string,
  options: BrowseQuery,
  database: CustomShellDb
) {
  const filters = [publishedOnSite(siteId)]

  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    // Title and the line under it. Not the slug — a visitor searches for what
    // a place is called, and the admin's list already searches addresses.
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryListings.metaDescription, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }

  if (options.categoryId) {
    filters.push(
      inArray(
        directoryListings.id,
        // Written as a subquery rather than two round trips: an empty category
        // then matches nothing on its own, with no "did I get an empty list"
        // branch to get wrong.
        listingIdsInCategory(siteId, options.categoryId, database)
      )
    )
  }

  const where = and(...filters)
  const distanceKm = options.near
    ? sql<
        number | null
      >`case when ${directoryListings.latitude} is null or ${directoryListings.longitude} is null then null else 6371 * 2 * asin(least(1, sqrt(
        power(sin(radians(${directoryListings.latitude} - ${options.near.latitude}) / 2), 2)
        + cos(radians(${options.near.latitude})) * cos(radians(${directoryListings.latitude}))
        * power(sin(radians(${directoryListings.longitude} - ${options.near.longitude}) / 2), 2)
      ))) end`
    : undefined
  const nearWhere =
    options.near && options.radius && distanceKm
      ? and(
          where,
          or(
            sql`${distanceKm} <= ${options.radius}`,
            sql`${directoryListings.latitude} is null`
          )
        )
      : where
  const ordinaryOrder = orderFor(
    options.sort === "distance" ? "order" : options.sort,
    siteId,
    options.featuredFirst
  )
  const ordered =
    options.sort === "distance" && distanceKm
      ? [sql`${distanceKm} asc nulls last`, ...ordinaryOrder]
      : options.near
        ? [sql`${directoryListings.latitude} is null`, ...ordinaryOrder]
        : ordinaryOrder

  return { where: nearWhere, ordered, distanceKm }
}

/** One page of published listings, ordered and counted. */
async function listingPage(
  siteId: string,
  options: BrowseQuery & { page: number; pageSize: number },
  database: CustomShellDb
): Promise<{ listings: PublicListingCard[]; total: number; page: number }> {
  const page = Math.max(1, Math.trunc(options.page))
  const offset = (page - 1) * options.pageSize
  const { where, ordered, distanceKm } = browseQuery(siteId, options, database)

  const rows = await database
    .select({
      ...cardColumns,
      ...(distanceKm ? { distanceKm } : {}),
      total: sql<number>`count(*) over()::int`,
    })
    .from(directoryListings)
    .where(where)
    .orderBy(...ordered)
    .limit(options.pageSize)
    .offset(offset)

  // A stale address may ask for a page beyond the end. The window count has
  // no row to ride on then, so that rare case does one count-only fallback.
  let total = rows[0]?.total
  if (total === undefined && offset > 0) {
    const [countRow] = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryListings)
      .where(where)
    total = countRow?.total ?? 0
  }

  const cardRows = rows.map(({ total: _total, ...row }) => row)

  return {
    listings: await toCards(siteId, cardRows, database),
    total: total ?? 0,
    page,
  }
}

/** The browse page: one page of listings and the filters above it. */
async function readPublicBrowseUncached(
  site: VisitorSite,
  options: {
    search?: string
    category?: string
    sort?: DirectorySort
    page: number
    near?: DirectoryNearPoint
    radius?: number
  },
  database: CustomShellDb = db
): Promise<PublicBrowse> {
  const [allCategories, settings] = await Promise.all([
    publicCategories(site.id, database),
    directorySettingsFor(site.id, database),
  ])
  const chosen = options.category
    ? allCategories.find((category) => category.slug === options.category)
    : undefined
  const resolvedSort =
    options.sort ?? (options.near ? "distance" : settings.defaultSort)

  // A category address nobody has is treated as no filter rather than as an
  // error: a stale link should still show the directory.
  const { listings, total, page } = await listingPage(
    site.id,
    {
      ...options,
      sort: resolvedSort,
      categoryId: chosen?.id,
      pageSize: settings.pageSize,
      featuredFirst: settings.featuredFirst,
      near: options.near,
      radius: options.radius,
    },
    database
  )

  return {
    site: { name: site.name, url: site.url },
    listings,
    total,
    page,
    pageSize: settings.pageSize,
    categories: allCategories.filter((category) => category.listingCount > 0),
    browseTitle: settings.browseTitle,
    browseIntro: settings.browseIntro,
    sort: resolvedSort,
    // Two more queries, and only for a site that switched the row on.
    categoryCards: settings.browseCategoriesEnabled
      ? await readDirectoryCategoryCards(
          site.id,
          resolvedCategoryChoice(
            {
              source: settings.browseCategorySource,
              pickedCategoryIds: settings.browsePickedCategoryIds,
            },
            MAX_DIRECTORY_CATEGORY_CARDS
          ),
          database
        )
      : [],
    mapAvailable: settings.mapEnabled && settings.hasMapKey,
  }
}

export function readPublicBrowse(
  site: VisitorSite,
  options: {
    search?: string
    category?: string
    sort?: DirectorySort
    page: number
    near?: DirectoryNearPoint
    radius?: number
  },
  database: CustomShellDb = db
): Promise<PublicBrowse> {
  const resolvedOptions = {
    ...options,
    radius: options.near
      ? (options.radius ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM)
      : undefined,
  }
  return cachedPublicDirectoryRead(
    site.id,
    "browse",
    {
      site: { name: site.name, url: site.url },
      search: resolvedOptions.search ?? "",
      category: resolvedOptions.category ?? "",
      sort: resolvedOptions.sort ?? "",
      page: resolvedOptions.page,
      near: resolvedOptions.near ?? null,
      radius: resolvedOptions.radius ?? null,
    },
    () => readPublicBrowseUncached(site, resolvedOptions, database)
  )
}

/**
 * The pins for the filters a visitor has applied, capped, and how many there
 * really are.
 *
 * Everything about *which* listings is `browseQuery`, the same one the grid
 * uses, plus one extra rule: a listing with no coordinates is not on the map.
 * That is not a filter the visitor chose, so the count it is measured against
 * counts the same way — the sentence above a capped map compares mappable
 * listings with mappable listings, never with the grid's total.
 */
async function readDirectoryMapUncached(
  site: VisitorSite,
  options: {
    search?: string
    category?: string
    sort?: DirectorySort
    near?: DirectoryNearPoint
    radius?: number
  },
  database: CustomShellDb
): Promise<Omit<PublicDirectoryMap, "apiKey"> | null> {
  // Asked here rather than trusted from the browse payload: this is a door of
  // its own, and a site that never switched the map on must not be able to have
  // its listing coordinates read by calling it directly.
  const settings = await directorySettingsFor(site.id, database)
  if (!settings.mapEnabled) return null

  // A category address nobody has is no filter rather than an error, the same
  // as the grid: a stale link should still show the map.
  const categoryId = options.category
    ? await categoryIdForSlug(site.id, options.category, database)
    : undefined

  const { where, ordered } = browseQuery(
    site.id,
    {
      search: options.search,
      categoryId,
      sort: options.sort ?? (options.near ? "distance" : settings.defaultSort),
      featuredFirst: settings.featuredFirst,
      near: options.near,
      radius: options.radius,
    },
    database
  )

  const mappable = and(
    where,
    isNotNull(directoryListings.latitude),
    isNotNull(directoryListings.longitude)
  )

  const rows = await database
    .select({
      ...cardColumns,
      latitude: directoryListings.latitude,
      longitude: directoryListings.longitude,
      total: sql<number>`count(*) over()::int`,
    })
    .from(directoryListings)
    .where(mappable)
    .orderBy(...ordered)
    .limit(DIRECTORY_MAP_LISTING_LIMIT)

  const total = rows[0]?.total ?? 0
  // The query already refuses a row missing either number, so this narrowing
  // drops nothing. It is written as a check rather than a cast so the promise
  // the type makes — a pin always has both — is one the compiler proved.
  const pinRows = rows.flatMap(({ total: _total, ...row }) =>
    row.latitude === null || row.longitude === null
      ? []
      : [{ ...row, latitude: row.latitude, longitude: row.longitude }]
  )

  return { pins: await toCards(site.id, pinRows, database), total }
}

export async function readDirectoryMap(
  site: VisitorSite,
  options: {
    search?: string
    category?: string
    sort?: DirectorySort
    near?: DirectoryNearPoint
    radius?: number
  },
  database: CustomShellDb = db
): Promise<PublicDirectoryMap | null> {
  const resolvedOptions = {
    ...options,
    radius: options.near
      ? (options.radius ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM)
      : undefined,
  }
  const pins = await cachedPublicDirectoryRead(
    site.id,
    "map",
    {
      search: resolvedOptions.search ?? "",
      category: resolvedOptions.category ?? "",
      sort: resolvedOptions.sort ?? "",
      near: resolvedOptions.near ?? null,
      radius: resolvedOptions.radius ?? null,
    },
    () => readDirectoryMapUncached(site, resolvedOptions, database)
  )
  if (!pins) return null

  // Read after the cache, like every other secret-shaped value here: a key
  // pasted a minute ago should reach the next visitor, not the one after the
  // cache expires.
  const apiKey = await directoryMapDisplayKey(site.id, database)
  if (!apiKey) return null

  return { apiKey, ...pins }
}

/**
 * Other published listings sharing a category with this one.
 *
 * Same rule as the directory app: anything in one of its categories, itself
 * excluded, in the hand-set order. A listing in no category has no related
 * listings, which is right — there is nothing saying what it is like.
 */
async function relatedListings(
  siteId: string,
  listingId: string,
  categoryIds: string[],
  featuredFirst: boolean,
  database: CustomShellDb
): Promise<PublicListingCard[]> {
  if (categoryIds.length === 0) return []

  const siblings = database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.categoryId, categoryIds)
      )
    )

  const rows = await database
    .select(cardColumns)
    .from(directoryListings)
    .where(
      and(
        publishedOnSite(siteId),
        ne(directoryListings.id, listingId),
        inArray(directoryListings.id, siblings)
      )
    )
    .orderBy(...orderFor("order", siteId, featuredFirst))
    .limit(RELATED_LISTING_COUNT)

  return toCards(siteId, rows, database)
}

/**
 * One listing by its address, or null.
 *
 * Null covers all three ways this misses — no such address, a draft, another
 * site's listing — on purpose. A visitor is told the same thing in each case,
 * and so is anybody calling this endpoint directly.
 */
type CachedPublicListingPage = Omit<PublicListingPage, "claim"> & {
  claim: Omit<PublicClaimState, "signedIn" | "claimed" | "mine">
}

async function readPublicListingUncached(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<CachedPublicListingPage | null> {
  const [row] = await database
    .select()
    .from(directoryListings)
    .where(and(publishedOnSite(site.id), eq(directoryListings.slug, slug)))
    .limit(1)

  if (!row) return null
  const coordinates = cleanListingCoordinates(row.latitude, row.longitude)

  const links = await database
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      isPrimary: categoryRelationships.isPrimary,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, site.id),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        eq(categoryRelationships.contentId, row.id)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const primary = links.find((link) => link.isPrimary) ?? links[0] ?? null

  const [settings, featured, sections] = await Promise.all([
    directorySettingsFor(site.id, database),
    activeFeaturedForListings(site.id, [row.id], database),
    listCustomSections(site.id, database),
  ])

  return {
    site: { name: site.name, url: site.url },
    listing: {
      id: row.id,
      title: row.title,
      slug: row.slug,
      metaDescription: row.metaDescription,
      rating: row.rating,
      featuredImage: row.featuredImage,
      gallery: cleanListingGallery(row.gallery),
      hours: cleanListingHours(row.hours),
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      // Cleaned on the way out as well as in, exactly as the admin's read
      // does: a row edited straight in the database is still only allowed to
      // hand a page shapes it knows are safe.
      contactLinks: cleanContactLinks(row.contactLinks),
      body: cleanWrittenPageBody(row.body),
      // Cleaned against the site's definitions here too, for the same reason
      // the links and the body are: a row edited straight in the database
      // only ever hands a page shapes this app knows.
      customSections: customSectionsForDisplay(
        sections,
        cleanCustomValues(sections, row.customValues)
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      featured: featured.has(row.id),
    },
    shareImageVersion: listingShareImageVersion({
      title: row.title,
      category: primary?.name ?? null,
      siteName: site.name,
      accentColor: site.accentColor ?? "",
      updatedAt: row.updatedAt,
    }),
    categories: links.map((link) => ({ name: link.name, slug: link.slug })),
    primaryCategory: primary
      ? { name: primary.name, slug: primary.slug }
      : null,
    related: await relatedListings(
      site.id,
      row.id,
      links.map((link) => link.id),
      settings.featuredFirst,
      database
    ),
    claim: {
      enabled: settings.claimsEnabled,
      buttonLabel: settings.claimButtonLabel,
      pendingMessage: settings.claimPendingMessage,
      approvedMessage: settings.claimApprovedMessage,
    },
  }
}

export async function readPublicListing(
  site: VisitorSite,
  slug: string,
  // Who is reading is deliberately used only after the shared page cache.
  // The visitor's own claim status must never be handed to another visitor.
  options: { viewerId?: string | null } = {},
  database: CustomShellDb = db
): Promise<PublicListingPage | null> {
  const page = await cachedPublicDirectoryRead(
    site.id,
    "listing",
    {
      site: {
        name: site.name,
        url: site.url,
        accentColor: site.accentColor ?? "",
      },
      slug,
    },
    () => readPublicListingUncached(site, slug, database)
  )
  if (!page) return null

  const claimState = await claimStateFor(
    site.id,
    page.listing.id,
    options.viewerId ?? null,
    database
  )
  return {
    ...page,
    claim: {
      ...page.claim,
      signedIn: Boolean(options.viewerId),
      claimed: claimState.claimed,
      mine: claimState.mine,
    },
  }
}

/** Home → … → this category, for the breadcrumb. */
function ancestorsOf(
  category: PublicCategory,
  all: PublicCategory[]
): PublicCategoryLink[] {
  const byId = new Map(all.map((row) => [row.id, row]))
  const chain: PublicCategoryLink[] = []

  let walker: PublicCategory | undefined = category
  // A tree that somehow pointed at itself would loop forever, so the walk is
  // bounded rather than trusted. The same twenty the admin's own tree check
  // uses.
  for (let depth = 0; walker && depth < 20; depth += 1) {
    chain.unshift({ name: walker.name, slug: walker.slug })
    walker = walker.parentId ? byId.get(walker.parentId) : undefined
  }
  return chain
}

/** One category's page, or null when this site has no category at that address. */
async function readPublicCategoryUncached(
  site: VisitorSite,
  slug: string,
  options: { page: number },
  database: CustomShellDb = db
): Promise<PublicCategoryPage | null> {
  const [all, settings] = await Promise.all([
    publicCategories(site.id, database),
    directorySettingsFor(site.id, database),
  ])
  const category = all.find((row) => row.slug === slug)
  if (!category) return null
  const children = all.filter((row) => row.parentId === category.id)

  const [{ listings, total, page }, childCounts] = await Promise.all([
    listingPage(
      site.id,
      {
        categoryId: category.id,
        sort: settings.defaultSort,
        page: options.page,
        pageSize: settings.pageSize,
        featuredFirst: settings.featuredFirst,
      },
      database
    ),
    publishedSubtreeCounts(
      site.id,
      children.map((row) => row.id),
      database
    ),
  ])

  return {
    site: { name: site.name, url: site.url },
    category,
    ancestors: ancestorsOf(category, all),
    children: children.map((row) => ({
      ...row,
      listingCount: childCounts.get(row.id) ?? 0,
    })),
    listings,
    total,
    page,
    pageSize: settings.pageSize,
    browseTitle: settings.browseTitle,
  }
}

export function readPublicCategory(
  site: VisitorSite,
  slug: string,
  options: { page: number },
  database: CustomShellDb = db
): Promise<PublicCategoryPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "category",
    { site: { name: site.name, url: site.url }, slug, page: options.page },
    () => readPublicCategoryUncached(site, slug, options, database)
  )
}
