/**
 * A site's home page rows, in the parts the browser and the server both need.
 *
 * A row is a heading, an optional line under it, and then listings — a
 * category, an order, how many, how they draw — or a card per category, or the
 * soonest upcoming events, or the newest live deals.
 * Everything that decides what is allowed lives here, so the admin form, the
 * endpoint and the server all refuse the same things rather than three slightly
 * different lists.
 */

import type { DirectorySort } from "@/lib/directory/public-search"
import type { EventWhen } from "@/lib/events/event-time"

/**
 * What the address `/` is, which depends entirely on the host that asked.
 *
 * Two answers, and the difference is the whole point. **A site's own address**
 * gets that site's home page, or null when it has none and the shell's front
 * page should draw instead. **The deployment's own address** is not a site at
 * all, and the root there belongs to whoever runs the platform.
 *
 * A host that resolves to no workspace counts as `"site"` deliberately, so an
 * address nobody has taken keeps behaving exactly as it did rather than
 * becoming a sign-in page.
 *
 * `signedIn` rides along because the platform's root forwards on it, and asking
 * again from the browser would be a second round trip to answer one question.
 *
 * It lives in this module rather than beside the endpoint that fills it because
 * `src/app/options.ts` names it, and that file may not reach `@/lib/api/*` even
 * for a type.
 */
export type DirectoryFrontPageAnswer =
  { host: "site" } | { host: "platform"; signedIn: boolean }

/** How a row picks and orders its listings. The first one is the default. */
export const DIRECTORY_FRONT_PAGE_SORTS = [
  "newest",
  "featured",
  "rating",
  "name",
] as const

export type DirectoryFrontPageSort = (typeof DIRECTORY_FRONT_PAGE_SORTS)[number]

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

export const DIRECTORY_FRONT_PAGE_COUNT_MIN = 1
export const DIRECTORY_FRONT_PAGE_COUNT_MAX = 12
export const DIRECTORY_FRONT_PAGE_COUNT_DEFAULT = 8

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

/**
 * One post in a home page row, in the shape the Posts page's cards draw.
 * Spelled out here for the same reason as the event and the listing below:
 * the server's own type may not be imported by a browser-side file.
 */
export type DirectoryFrontPagePost = {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  publishedAt: Date
  readMinutes: number
  category: { name: string; slug: string } | null
}

/**
 * One event in a home page row, in the shape the Events page's list draws.
 * Spelled out here for the same reason as the listing below: the server's
 * own type may not be imported by a browser-side file.
 */
export type DirectoryFrontPageEvent = EventWhen & {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  placeName: string
  takesSignUps: boolean
  going: number
  category: { name: string; slug: string } | null
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
  address: string
  category: { name: string; slug: string } | null
  neighbourhood: { name: string; slug: string } | null
  claimed: boolean
  featured: boolean
  /** Present only on a row that draws a map, where a pin needs both. */
  latitude?: number
  longitude?: number
}
