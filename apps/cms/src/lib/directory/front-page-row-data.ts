/**
 * What each of CMS's own front page rows is filled with.
 *
 * The server's reader for a kind returns one of these, the shell carries it to
 * the browser with the rest of the page, and the matching component draws it.
 * They live here rather than beside the readers because a browser-side file may
 * not import `@/server/*`, not even for a type.
 *
 * Every shape is what its cards already take, so nothing is converted on the
 * way: `DirectoryFrontPageListing` is what the grid and the map draw,
 * `DirectoryCategoryCard` is what the category cards draw, and so on.
 */

import type { DirectoryCategoryCard } from "@/lib/directory/category-cards"
import type {
  DirectoryFrontPageEvent,
  DirectoryFrontPageListing,
  DirectoryFrontPagePost,
} from "@/lib/directory/front-page"
import type { DirectoryFrontPageLayout } from "@/lib/directory/front-page"
import type { DirectorySort } from "@/lib/directory/public-search"
import type { DealCardView } from "@/lib/promotions/deal-content"

export type ListingsRowData = {
  listings: DirectoryFrontPageListing[]
  layout: DirectoryFrontPageLayout
  /** What the row's "see them all" link carries. */
  browse: { category?: string; sort?: DirectorySort }
  /**
   * The site's browser map key, and only on a row that actually draws a map, so
   * a page with no map never carries the key at all.
   */
  mapApiKey: string | null
}

export type CategoriesRowData = {
  cards: DirectoryCategoryCard[]
}

export type EventsRowData = {
  events: DirectoryFrontPageEvent[]
  /** "Eastern Time", the zone the times are in. */
  zone: string
  /** The chosen category's address, for "See all events" to carry. */
  categorySlug: string | null
}

export type DealsRowData = {
  deals: DealCardView[]
  categorySlug: string | null
}

export type PostsRowData = {
  posts: DirectoryFrontPagePost[]
  /** The site's own name, printed under each card where a byline would be. */
  siteName: string
}
