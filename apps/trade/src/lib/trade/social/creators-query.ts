/**
 * What the creators list is showing: the search, the three filters, and the
 * sort. One shape, read by the screen, written into the address, and sent to
 * the server.
 *
 * **It lives in the address so a filtered list can be reloaded and pasted.**
 * The screen never holds a second copy of it in React state; the address is
 * the one answer, which is what makes the back button return to the filters
 * you left rather than to an empty list.
 *
 * Defaults are left out of the address. `/social` and
 * `/social?posts=any&last=any&sort=last&dir=desc` are the same screen, and
 * only the first is worth pasting to somebody.
 */

/** How many posts are held for a creator. */
export type SocialPostsFilter = "any" | "under50" | "50to500" | "over500"

/**
 * How recently the newest post held was written.
 *
 * `older` is what used to be a separate "gone quiet" tick beside these. Two
 * controls picking exactly the same creators is one control too many, so the
 * tick went (Tyler, 29 Sep 2026).
 */
export type SocialLastFilter = "any" | "week" | "month" | "older"

export type SocialCreatorSort = "posts" | "last" | "handle" | "followers"

export type SortDirection = "asc" | "desc"

/** The longest search the box accepts. */
export const MAX_SEARCH_LENGTH = 100

const POSTS_FILTERS: readonly SocialPostsFilter[] = [
  "any",
  "under50",
  "50to500",
  "over500",
]
const LAST_FILTERS: readonly SocialLastFilter[] = [
  "any",
  "week",
  "month",
  "older",
]
const SORTS: readonly SocialCreatorSort[] = [
  "posts",
  "last",
  "handle",
  "followers",
]

export const POSTS_FILTER_LABELS: Record<SocialPostsFilter, string> = {
  any: "Posts: any",
  under50: "Under 50 posts",
  "50to500": "50 to 500 posts",
  over500: "Over 500 posts",
}

export const LAST_FILTER_LABELS: Record<SocialLastFilter, string> = {
  any: "Last post: any",
  week: "Posted this week",
  month: "Posted this month",
  older: "Gone quiet, over a month",
}

/** The column headings, which are also what the sort is named by. */
export const SORT_LABELS: Record<SocialCreatorSort, string> = {
  handle: "Creator",
  followers: "Followers",
  posts: "Posts",
  last: "Last post",
}

/** The whole question, with every blank filled in. */
export type SocialCreatorsQuery = {
  q: string
  posts: SocialPostsFilter
  last: SocialLastFilter
  sort: SocialCreatorSort
  dir: SortDirection
}

/** The same question as it appears in the address, defaults left out. */
export type SocialCreatorsSearch = {
  q?: string
  posts?: SocialPostsFilter
  last?: SocialLastFilter
  sort?: SocialCreatorSort
  dir?: SortDirection
}

export const DEFAULT_CREATORS_QUERY: SocialCreatorsQuery = {
  q: "",
  posts: "any",
  last: "any",
  // Newest first, because the reason to open this screen is usually "who has
  // said something lately".
  sort: "last",
  dir: "desc",
}

/**
 * The address, cleaned.
 *
 * Anything unrecognised becomes nothing at all rather than an error: a stale
 * link somebody saved before a filter was renamed still opens the list. This
 * is the typed first layer only. Every value it produces is one of a fixed
 * set, and the server checks the same set again, because a request can arrive
 * without ever passing through here.
 */
export function readCreatorsSearch(
  search: Record<string, unknown>
): SocialCreatorsSearch {
  const clean: SocialCreatorsSearch = {}

  const q = typeof search.q === "string" ? search.q.trim() : ""
  if (q) clean.q = q.slice(0, MAX_SEARCH_LENGTH)

  const posts = oneOf(search.posts, POSTS_FILTERS)
  if (posts && posts !== "any") clean.posts = posts

  const last = oneOf(search.last, LAST_FILTERS)
  if (last && last !== "any") clean.last = last

  const sort = oneOf(search.sort, SORTS)
  if (sort && sort !== DEFAULT_CREATORS_QUERY.sort) clean.sort = sort

  const dir = oneOf(search.dir, ["asc", "desc"] as const)
  if (dir && dir !== DEFAULT_CREATORS_QUERY.dir) clean.dir = dir

  return clean
}

/** The address filled out into the whole question. */
export function creatorsQuery(
  search: SocialCreatorsSearch
): SocialCreatorsQuery {
  return {
    q: search.q ?? DEFAULT_CREATORS_QUERY.q,
    posts: search.posts ?? DEFAULT_CREATORS_QUERY.posts,
    last: search.last ?? DEFAULT_CREATORS_QUERY.last,
    sort: search.sort ?? DEFAULT_CREATORS_QUERY.sort,
    dir: search.dir ?? DEFAULT_CREATORS_QUERY.dir,
  }
}

/** The whole question back down to what the address needs to carry. */
export function creatorsSearch(
  query: SocialCreatorsQuery
): SocialCreatorsSearch {
  const search: SocialCreatorsSearch = {}
  const q = query.q.trim().slice(0, MAX_SEARCH_LENGTH)
  if (q) search.q = q
  if (query.posts !== "any") search.posts = query.posts
  if (query.last !== "any") search.last = query.last
  if (query.sort !== DEFAULT_CREATORS_QUERY.sort) search.sort = query.sort
  if (query.dir !== DEFAULT_CREATORS_QUERY.dir) search.dir = query.dir
  return search
}

/** How many filters are on, for the narrow screen's one filter button. */
export function activeFilterCount(query: SocialCreatorsQuery): number {
  return (query.posts === "any" ? 0 : 1) + (query.last === "any" ? 0 : 1)
}

/** Whether anything is narrowing the list, search included. */
export function isNarrowed(query: SocialCreatorsQuery): boolean {
  return query.q.trim() !== "" || activeFilterCount(query) > 0
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}
