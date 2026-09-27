/**
 * The kinds of front page row CMS adds to the shell's builder.
 *
 * The shell owns the row itself — its heading, its line, its alignment, whether
 * it is hidden and which screens it draws on. Everything below is what one of
 * these rows holds *beyond* that: which listings, how many, how they draw.
 *
 * The shell keeps these fields as a bag it never reads, so this file is the one
 * place that decides what is in the bag. The editor panel, the public component
 * and the server's reader all clean what they are given through the same
 * functions here, because a row can also be hand-edited in the settings row.
 *
 * `lib/directory/front-page.ts` beside this one is the app's older, per-site
 * builder, and it is on its way out. The labels, the orders, the layouts and
 * the counts are read from it rather than copied, so the two cannot disagree
 * while both exist.
 */

import {
  cleanPickedCategoryIds,
  isDirectoryCategorySource,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_COUNT_DEFAULT,
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  isDirectoryFrontPageLayout,
  isDirectoryFrontPageSort,
  type DirectoryFrontPageLayout,
  type DirectoryFrontPageSort,
} from "@/lib/directory/front-page"

/** The five keys, as they are stored on a row and read back by the app. */
export const CMS_FRONT_PAGE_ROW_KEYS = [
  "listings",
  "categories",
  "events",
  "deals",
  "posts",
] as const

export type CmsFrontPageRowKey = (typeof CMS_FRONT_PAGE_ROW_KEYS)[number]

export const CMS_FRONT_PAGE_ROW_LABELS: Record<CmsFrontPageRowKey, string> = {
  listings: "Listings",
  categories: "Category cards",
  events: "Upcoming events",
  deals: "Current deals",
  posts: "Latest posts",
}

export const CMS_FRONT_PAGE_ROW_HINTS: Record<CmsFrontPageRowKey, string> = {
  listings: "Cards for individual listings, chosen and ordered below.",
  categories:
    "A card per category, with its photo and how many listings are under it.",
  events:
    "The soonest events that are not over yet, as cards with their date, times and place. Left off the page while nothing is coming up.",
  deals:
    "The newest deals that are not over yet, as cards with their headlines. Left off the page while there are none.",
  posts:
    "The newest published posts, as cards with their cover photo and how long each takes to read. Left off the page while there are none.",
}

export function isCmsFrontPageRowKey(
  value: unknown
): value is CmsFrontPageRowKey {
  return (CMS_FRONT_PAGE_ROW_KEYS as readonly unknown[]).includes(value)
}

/** A row of listings: which ones, in what order, how many, and how they draw. */
export type ListingsRowSettings = {
  /** Null is every category. */
  categoryId: string | null
  sort: DirectoryFrontPageSort
  count: number
  layout: DirectoryFrontPageLayout
}

/** A row of category cards: where the categories come from, and how many. */
export type CategoriesRowSettings = {
  source: DirectoryCategorySource
  /** Hand-picked rows only, in the admin's order. */
  pickedCategoryIds: string[]
  count: number
}

/** Events, deals and posts are all a category and a count. */
export type PickedRowSettings = {
  /** Null is every one of them. */
  categoryId: string | null
  count: number
}

export type CmsFrontPageRowSettings =
  ListingsRowSettings | CategoriesRowSettings | PickedRowSettings

function cleanCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DIRECTORY_FRONT_PAGE_COUNT_DEFAULT
  }
  return Math.min(
    DIRECTORY_FRONT_PAGE_COUNT_MAX,
    Math.max(DIRECTORY_FRONT_PAGE_COUNT_MIN, value)
  )
}

/** An id as it is stored: a string, or null for "every one of them". */
function cleanId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function cleanListingsRowSettings(
  value: Record<string, unknown> | null | undefined
): ListingsRowSettings {
  return {
    categoryId: cleanId(value?.categoryId),
    sort: isDirectoryFrontPageSort(value?.sort) ? value.sort : "newest",
    count: cleanCount(value?.count),
    layout: isDirectoryFrontPageLayout(value?.layout) ? value.layout : "grid",
  }
}

export function cleanCategoriesRowSettings(
  value: Record<string, unknown> | null | undefined
): CategoriesRowSettings {
  return {
    source: isDirectoryCategorySource(value?.source)
      ? value.source
      : "top-level",
    pickedCategoryIds: cleanPickedCategoryIds(value?.pickedCategoryIds),
    count: cleanCount(value?.count),
  }
}

export function cleanPickedRowSettings(
  value: Record<string, unknown> | null | undefined
): PickedRowSettings {
  return {
    categoryId: cleanId(value?.categoryId),
    count: cleanCount(value?.count),
  }
}

/** One row's settings, cleaned by the rules of whichever kind it is. */
export function cleanCmsFrontPageRowSettings(
  key: CmsFrontPageRowKey,
  value: Record<string, unknown> | null | undefined
): CmsFrontPageRowSettings {
  if (key === "listings") return cleanListingsRowSettings(value)
  if (key === "categories") return cleanCategoriesRowSettings(value)
  return cleanPickedRowSettings(value)
}
