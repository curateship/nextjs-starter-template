/**
 * A row of category cards — photo, name, and how many listings are under it.
 *
 * The cards are the ones a category page already draws underneath a parent. All
 * that is decided here is *which* categories a row shows, and that answer is
 * written once because two places ask it: a home page row and the top of the
 * browse page.
 */

/** Where a row's categories come from. The first one is the default. */
export const DIRECTORY_CATEGORY_SOURCES = ["top-level", "picked"] as const

export type DirectoryCategorySource =
  (typeof DIRECTORY_CATEGORY_SOURCES)[number]

export const DIRECTORY_CATEGORY_SOURCE_LABELS: Record<
  DirectoryCategorySource,
  string
> = {
  "top-level": "The top-level categories",
  picked: "Categories I choose",
}

export const DIRECTORY_CATEGORY_SOURCE_HINTS: Record<
  DirectoryCategorySource,
  string
> = {
  "top-level":
    "Every category with no parent, in the order they are arranged on the Categories screen.",
  picked: "Only the ones below, in the order you put them in.",
}

/**
 * The most cards one row will ever draw.
 *
 * The same twelve a row of listings is capped at, for the same reason: a row is
 * a way into the directory, not the directory itself.
 */
export const MAX_DIRECTORY_CATEGORY_CARDS = 12

export const DIRECTORY_CATEGORY_PICK_MESSAGE =
  "Choose at least one category, or show the top-level ones instead."

export function isDirectoryCategorySource(
  value: unknown
): value is DirectoryCategorySource {
  return (DIRECTORY_CATEGORY_SOURCES as readonly unknown[]).includes(value)
}

/**
 * The saved list of chosen categories, made safe to use.
 *
 * Anything that is not a string is dropped, duplicates are dropped, and the
 * list is capped — so a value edited straight in the database still describes a
 * row this app can draw. The order is kept, because the order is what the admin
 * chose. Whether each id still names a category on this site is decided when the
 * cards are read, not here: this file is browser-side and knows nothing about
 * what exists.
 */
export function cleanPickedCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string") continue
    const id = entry.trim()
    if (!id || id.length > 36 || seen.has(id)) continue
    seen.add(id)
    if (seen.size >= MAX_DIRECTORY_CATEGORY_CARDS) break
  }
  return [...seen]
}

/**
 * One category card.
 *
 * Spelled out here rather than reusing `PublicCategory`, and it has to be: that
 * type lives in `@/server/*`, which a browser-side file may not import. The
 * shared card component typechecks against this at every call site, so the two
 * cannot quietly drift apart without the compiler saying so.
 */
export type DirectoryCategoryCard = {
  id: string
  name: string
  slug: string
  featuredImage: string
  /** Published listings under it, counting everything nested beneath it. */
  listingCount: number
}

/** What a row needs to know to work out its cards. */
export type DirectoryCategoryChoice = {
  source: DirectoryCategorySource
  pickedCategoryIds: string[]
  /** At most this many cards, whichever source they came from. */
  limit: number
}
