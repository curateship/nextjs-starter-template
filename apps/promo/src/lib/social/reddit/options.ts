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
 * Where the Reddit screen's panel arrangement is remembered.
 *
 * Not added to `panelLayoutKey` in `src/lib/layout/panel-layout.ts`, which is
 * the shell's own registry of its own keys and a file an app never edits.
 * `useRememberedPanelLayout` takes any string, and the `promo-` prefix is what
 * keeps this from colliding with a shell key. The value is what a browser has
 * already saved under, so it does not change when the constant moves.
 *
 * The `-2` is deliberate. On 6 Oct 2026 the side panels' default widths became
 * their minimum widths, and a remembered layout outranks the default, so a
 * browser that had already drawn the old widths would keep them and the change
 * would appear to do nothing. A new key starts every browser on the new widths.
 */
export const REDDIT_PANEL_LAYOUT_KEY = "promo-reddit-workspace-2"
