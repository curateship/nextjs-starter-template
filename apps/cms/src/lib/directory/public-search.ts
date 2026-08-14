/**
 * The public directory's list state, named once so the route's address reader,
 * the endpoint and the toolbar all agree on what may appear in the URL.
 *
 * Separate from `listing-sort.ts` on purpose. That one is the admin's list —
 * it sorts by status and by when a row was last edited, neither of which means
 * anything to a visitor, and it has a draft filter a public page must never
 * offer. Sharing the two would mean one list of columns that half the callers
 * had to be told to ignore.
 */

/** How a visitor may order the list. The first one is the default. */
export const DIRECTORY_SORTS = ["order", "newest", "title"] as const

export type DirectorySort = (typeof DIRECTORY_SORTS)[number]

export function isDirectorySort(value: unknown): value is DirectorySort {
  return (
    typeof value === "string" &&
    DIRECTORY_SORTS.includes(value as DirectorySort)
  )
}

/**
 * `order` is the hand-set order an admin gives listings on the edit form, and
 * it is the default because that field exists for exactly this list. Ties fall
 * back to newest-first, so a directory where nobody has set an order still
 * reads sensibly.
 */
export const DIRECTORY_SORT_LABELS: Record<DirectorySort, string> = {
  order: "Recommended",
  newest: "Newest",
  title: "A to Z",
}

/**
 * What the browse page's address may carry.
 *
 * Every key is optional, and that is load-bearing rather than tidy: a route
 * whose search keys are required makes every `<Link>` to it spell all four out,
 * including the three it does not care about. Optional keys mean a link that
 * only wants to change the category says only that.
 */
export type DirectoryBrowseSearch = {
  q?: string
  category?: string
  sort?: DirectorySort
  page?: number
}

/** How many "you might also like" listings a detail page shows. */
export const RELATED_LISTING_COUNT = 3
