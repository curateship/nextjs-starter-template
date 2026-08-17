/**
 * A site's home page rows, in the parts the browser and the server both need.
 *
 * A row is a heading, an optional line under it, a category, an order, how
 * many listings and how they draw. Everything that decides what is allowed
 * lives here, so the admin form, the endpoint and the server all refuse the
 * same things rather than three slightly different lists.
 */

import type { DirectorySort } from "@/lib/directory/public-search"

/** How a row picks and orders its listings. The first one is the default. */
export const DIRECTORY_FRONT_PAGE_SORTS = [
  "newest",
  "featured",
  "rating",
  "name",
] as const

export type DirectoryFrontPageSort =
  (typeof DIRECTORY_FRONT_PAGE_SORTS)[number]

export const DIRECTORY_FRONT_PAGE_SORT_LABELS: Record<
  DirectoryFrontPageSort,
  string
> = {
  newest: "Newest first",
  featured: "Featured only",
  rating: "Top rated first",
  name: "A to Z",
}

/**
 * `featured` is a filter as well as an order, which is what the old
 * whole-page "featured" setting did: a row of featured listings that quietly
 * padded itself out with ordinary ones would be an advert nobody paid for.
 */
export const DIRECTORY_FRONT_PAGE_SORT_HINTS: Record<
  DirectoryFrontPageSort,
  string
> = {
  newest: "The most recently added listings.",
  featured: "Only listings with paid placement running right now.",
  rating: "Highest rated first. Unrated listings come last.",
  name: "Alphabetical by title.",
}

/** How a row draws its listings. The first one is the default. */
export const DIRECTORY_FRONT_PAGE_LAYOUTS = ["grid", "list", "map"] as const

export type DirectoryFrontPageLayout =
  (typeof DIRECTORY_FRONT_PAGE_LAYOUTS)[number]

export const DIRECTORY_FRONT_PAGE_LAYOUT_LABELS: Record<
  DirectoryFrontPageLayout,
  string
> = {
  grid: "Grid of cards",
  list: "One under the other",
  map: "Map with pins",
}

/**
 * Six rows of twelve is 72 listings, which is a home page. Seven rows of
 * twelve is somebody discovering by accident that the front page can fetch
 * four hundred records.
 */
export const MAX_DIRECTORY_FRONT_PAGE_SECTIONS = 6

export const DIRECTORY_FRONT_PAGE_COUNT_MIN = 1
export const DIRECTORY_FRONT_PAGE_COUNT_MAX = 12
export const DIRECTORY_FRONT_PAGE_COUNT_DEFAULT = 8

export const DIRECTORY_FRONT_PAGE_HEADING_MAX = 120
export const DIRECTORY_FRONT_PAGE_INTRO_MAX = 500

/** The sentence said when a seventh row is asked for, in one place. */
export const DIRECTORY_FRONT_PAGE_FULL_MESSAGE =
  `A home page can have ${MAX_DIRECTORY_FRONT_PAGE_SECTIONS} rows of listings. Delete one before adding another.`

export const DIRECTORY_FRONT_PAGE_COUNT_MESSAGE =
  `A row shows between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX} listings.`

export const DIRECTORY_FRONT_PAGE_HEADING_MESSAGE = "Give the row a heading."

export function isDirectoryFrontPageSort(
  value: unknown
): value is DirectoryFrontPageSort {
  return (DIRECTORY_FRONT_PAGE_SORTS as readonly unknown[]).includes(value)
}

export function isDirectoryFrontPageLayout(
  value: unknown
): value is DirectoryFrontPageLayout {
  return (DIRECTORY_FRONT_PAGE_LAYOUTS as readonly unknown[]).includes(value)
}

/** One row as the admin screen edits it. */
export type DirectoryFrontPageSection = {
  id: string
  displayOrder: number
  heading: string
  intro: string
  /** Null is every category. */
  categoryId: string | null
  /** The chosen category's public address, or null. Read for the row's link. */
  categorySlug: string | null
  /** The chosen category's name, so the admin list can say it. */
  categoryName: string | null
  sort: DirectoryFrontPageSort
  listingCount: number
  layout: DirectoryFrontPageLayout
}

/**
 * The order the browse page should open in when somebody follows a row's "see
 * them all" link.
 *
 * Two of the four have no browse equivalent — the browse page orders by the
 * site's own choice, by newest or by title, and has no "top rated" and no
 * "featured only". Those two send no order at all rather than a wrong one, so
 * the browse page opens in the order the site chose, showing the same
 * category. Naming that here keeps the guess out of the component.
 */
export function browseSortForFrontPageSort(
  sort: DirectoryFrontPageSort
): DirectorySort | undefined {
  if (sort === "newest") return "newest"
  if (sort === "name") return "title"
  return undefined
}

/** One row as the public page draws it. */
export type DirectoryFrontPageRow = {
  id: string
  heading: string
  intro: string
  layout: DirectoryFrontPageLayout
  /** What the row's "see them all" link should carry. */
  browse: { category?: string; sort?: DirectorySort }
  listings: Array<DirectoryFrontPageListing>
}

/**
 * One card, in the shape the public grid and map already draw.
 *
 * Spelled out here rather than reusing `PublicListingCard`, and it has to be:
 * that type lives in `@/server/*`, which a browser-side file may not import.
 * The grid and the map still typecheck against it at every call site, so the
 * two cannot quietly drift apart without the compiler saying so.
 */
export type DirectoryFrontPageListing = {
  id: string
  title: string
  slug: string
  metaDescription: string
  rating: number | null
  featuredImage: string
  category: { name: string; slug: string } | null
  claimed: boolean
  featured: boolean
  /** Present only on a row that draws a map, where a pin needs both. */
  latitude?: number
  longitude?: number
}

/** The complete browser-safe answer for a site's listings home page. */
export type DirectoryFrontPageData = {
  siteName: string
  /** The page's own title, from the site's browse title. */
  heading: string
  intro: string
  rows: DirectoryFrontPageRow[]
  /**
   * The site's browser map key, and only when a row actually draws a map. A
   * page with no map row never carries it, so the key is not published on a
   * home page that has no use for it.
   */
  mapApiKey: string | null
}
