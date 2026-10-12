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
 * Where the Projects dashboard's panel arrangement is remembered: the three
 * columns, and inside the middle one the keywords above the posts.
 *
 * Not added to `panelLayoutKey` in `src/lib/layout/panel-layout.ts`, which is
 * the shell's own registry of its own keys and a file an app never edits.
 * `useRememberedPanelLayout` takes any string, and the `promo-` prefix is what
 * keeps these from colliding with a shell key.
 */
export const PROJECTS_PANEL_LAYOUT_KEY = "promo-projects-workspace"
export const PROJECTS_MIDDLE_LAYOUT_KEY = "promo-projects-middle"

/**
 * The Everything row at the top of the keywords panel, chosen in place of a
 * keyword's id. It lists every saved search's posts in one ranked order, by
 * asking for the posts with no keyword at all. Keyword ids are uuids, so this
 * can never be mistaken for one.
 */
export const EVERYTHING = "everything"
