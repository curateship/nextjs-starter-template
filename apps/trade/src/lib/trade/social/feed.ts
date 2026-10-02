import type {
  SocialMarketRow,
  SocialPostRow,
} from "@/lib/trade/social/dashboard"

/**
 * Everything the social feed draws, in the shape the screen reads it.
 *
 * The whole page arrives in one answer from the route loader, because
 * `workspace/docs/rules/instant-first.md` says a screen answers from what the
 * app already knows before anything else runs. Two things are fetched
 * afterwards: a changed scope (a folder, a creator or a coin was clicked),
 * and older posts when somebody reaches the end of the list.
 */

/** One folder of creators, as the left panel and the manage window read it. */
export type SocialFolder = {
  id: string
  name: string
  position: number
  /** Switched off with the eye in the manage window; keeps its creators. */
  hidden: boolean
  creatorIds: string[]
}

/** A creator as the feed draws them: on a post row and in the left panel. */
export type SocialFeedCreator = {
  id: string
  handle: string
  displayName: string | null
  picture: string | null
}

/** One post on the feed: the post, plus whose it is. */
export type SocialFeedPostRow = SocialPostRow & {
  creator: SocialFeedCreator
}

/**
 * What the feed is narrowed to. All three null is Everyone. A creator wins
 * over a folder, so the two are never sent together; the coin stacks on
 * either.
 */
export type SocialFeedScope = {
  folderId: string | null
  creatorId: string | null
  coin: string | null
}

export const EVERYONE_SCOPE: SocialFeedScope = {
  folderId: null,
  creatorId: null,
  coin: null,
}

/**
 * One scope's answer: the newest page of its posts, the count behind them,
 * and the coins panel's rows counted over the same scope (without the coin
 * narrowing, so the panel still lists every coin to pick from).
 */
export type SocialFeedView = {
  posts: SocialFeedPostRow[]
  /** True when there are older posts than the ones in `posts`. */
  more: boolean
  /** How many posts the scope holds in all, before the coin narrowed it. */
  held: number
  coins: SocialMarketRow[]
}

export type SocialFeedPage = {
  posts: SocialFeedPostRow[]
  more: boolean
}

/** The whole screen in one answer. */
export type SocialFeed = SocialFeedView & {
  folders: SocialFolder[]
  /** Every creator this member tracks, A to Z by handle. */
  creators: SocialFeedCreator[]
  /** The server's own clock, so "2 days ago" is worked out against it. */
  readAt: number
}

/** A member cannot have an unbounded number of folders. */
export const MAX_SOCIAL_FOLDERS = 100
