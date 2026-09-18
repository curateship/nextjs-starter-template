/**
 * The Posts screen's list state, named once so the route's address reader, the
 * endpoint and the table headers agree on what may appear in the address.
 * The status filter is the listings one, because the two statuses are the same.
 */

export const POST_SORT_COLUMNS = [
  "title",
  "status",
  "published",
  "updated",
] as const

export type PostSortColumn = (typeof POST_SORT_COLUMNS)[number]

/** Words read A to Z; dates start newest first. */
export function postSortDirection(column: PostSortColumn): "asc" | "desc" {
  return column === "published" || column === "updated" ? "desc" : "asc"
}

/** How many posts one page of the public /posts list shows. */
export const POSTS_PAGE_SIZE = 12

/** How many of a category's newest posts its page shows under its listings. */
export const CATEGORY_POST_LIMIT = 6
