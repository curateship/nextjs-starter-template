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
import type { DealCardView } from "@/lib/promotions/deal-content"

/**
 * The way to the whole list, drawn by the shell beside the row's heading.
 *
 * A row shows a handful of many, so it carries the button that leads to all of
 * them. It travels with the row's contents rather than being built in the
 * browser, because the address depends on what the row was filtered to.
 */
export type FrontPageRowAction = { label: string; href: string }

export type ListingsRowData = {
  action: FrontPageRowAction
  listings: DirectoryFrontPageListing[]
  layout: DirectoryFrontPageLayout
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
  action: FrontPageRowAction
  events: DirectoryFrontPageEvent[]
  /** "Eastern Time", the zone the times are in. */
  zone: string
}

export type DealsRowData = {
  action: FrontPageRowAction
  deals: DealCardView[]
}

export type PostsRowData = {
  action: FrontPageRowAction
  posts: DirectoryFrontPagePost[]
  /** The site's own name, printed under each card where a byline would be. */
  siteName: string
}
