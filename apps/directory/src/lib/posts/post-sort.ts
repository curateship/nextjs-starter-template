/**
 * The Posts screen's list state, named once so the route's address reader, the
 * endpoint and the table headers agree on what may appear in the address.
 * The status filter and the Views ranges are the listings ones, because a post
 * has the same two statuses and its views come from the same daily counts.
 */

export const POST_SORT_COLUMNS = [
  "title",
  "status",
  "published",
  "views",
  "updated",
] as const

export type PostSortColumn = (typeof POST_SORT_COLUMNS)[number]

/** Words read A to Z; dates and counts start with the biggest first. */
export function postSortDirection(column: PostSortColumn): "asc" | "desc" {
  return column === "published" || column === "updated" || column === "views"
    ? "desc"
    : "asc"
}

/** How many posts one page of the public /posts list shows. */
export const POSTS_PAGE_SIZE = 12

/** How many of a category's newest posts its page shows under its listings. */
export const CATEGORY_POST_LIMIT = 6

/**
 * How many posts "More to read" offers at the foot of a post. The block is
 * this many or nothing, so it is never half empty.
 */
export const MORE_TO_READ_COUNT = 3
