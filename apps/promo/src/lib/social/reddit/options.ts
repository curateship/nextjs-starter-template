/**
 * The choices that belong to Reddit and to no other network.
 *
 * Everything shared — an account, a proxy, a found post, a draft, a job — is
 * in `../options.ts`. This file is the model for the next network: Instagram's
 * own choices go in `instagram/options.ts` beside it, and nothing has to move.
 */

/** Reddit's own search orders, named as Reddit names them. */
export const REDDIT_SORTS = ["relevance", "new", "top", "comments"] as const
export type RedditSort = (typeof REDDIT_SORTS)[number]

/** Reddit's own time windows. */
export const REDDIT_WINDOWS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "all",
] as const
export type RedditWindow = (typeof REDDIT_WINDOWS)[number]

/**
 * Where the Projects dashboard's panel arrangement is remembered: the widths
 * of its three columns.
 *
 * Not added to `panelLayoutKey` in `src/lib/layout/panel-layout.ts`, which is
 * the shell's own registry of its own keys and a file an app never edits.
 * `useRememberedPanelLayout` takes any string, and the `promo-` prefix is what
 * keeps these from colliding with a shell key.
 */
export const PROJECTS_PANEL_LAYOUT_KEY = "promo-projects-workspace"

/**
 * The Everything row at the top of the keywords panel, chosen in place of a
 * keyword's id. It lists every saved search's posts in one ranked order, by
 * asking for the posts with no keyword at all. Keyword ids are uuids, so this
 * can never be mistaken for one.
 */
export const EVERYTHING = "everything"

/**
 * The tabs across the Reddit module's middle column: three of posts, by their
 * stored status, then Today and Comments, which were screens of their own in
 * the left menu until Tyler, 14 Oct 2026: "Today and comments can be part of
 * the views tabs". The tab is kept in the project's address as `?view=`.
 */
export const FIND_VIEWS = ["new", "commented", "skipped"] as const
export type FindsTab = (typeof FIND_VIEWS)[number]

export const REDDIT_VIEWS = [...FIND_VIEWS, "today", "comments"] as const
export type RedditView = (typeof REDDIT_VIEWS)[number]

export function isFindsTab(view: RedditView): view is FindsTab {
  return (FIND_VIEWS as readonly string[]).includes(view)
}
