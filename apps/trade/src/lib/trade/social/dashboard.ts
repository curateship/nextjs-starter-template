import { marketChartHref, marketKey } from "@/lib/protocols/contracts"
import type { SocialPlatform } from "@/lib/trade/social/creator"
import type { SocialLink } from "@/lib/trade/social/x-profile"

/**
 * Everything one creator's dashboard draws, in the shape the screen reads it.
 *
 * The whole page arrives in one answer from the route loader, because
 * `workspace/docs/rules/instant-first.md` says a screen answers from what the
 * app already knows before anything else runs. Older posts are the one thing
 * fetched afterwards, and only when somebody scrolls to the end of the list.
 */

/** How many posts one page of the middle panel holds. */
export const SOCIAL_POSTS_PAGE = 50

/** Quiet for longer than this and the figures panel says so. */
export const SOCIAL_QUIET_DAYS = 30

export type SocialCreator = {
  id: string
  platform: SocialPlatform
  handle: string
  displayName: string | null
  picture: string | null
  /** Followers at the source. Null when no reader has supplied it. */
  followers: number | null
  /** When that follower count was read. */
  followersAt: number | null
  /** The website and bio links from their profile. */
  links: SocialLink[]
  addedAt: number
}

export type SocialPostRow = {
  id: string
  postedAt: number
  text: string
  url: string | null
  seen: number | null
  /**
   * The coins this post names, as Trade read them out of the words, in
   * alphabetical order. Empty when it names none, which is an answer.
   */
  coins: string[]
}

export type SocialMarketRow = {
  /** The coin's ticker as Trade lists it: "SOL", "kPEPE". */
  market: string
  /** How many of this creator's posts name it, across everything held. */
  posts: number
}

export type SocialDashboard = {
  creator: SocialCreator
  /** How many of this creator's posts are stored for this member. */
  postsHeld: number
  /** The newest page of posts, newest first. */
  posts: SocialPostRow[]
  /** True when there are older posts than the ones in `posts`. */
  more: boolean
  markets: SocialMarketRow[]
  /** The server's own clock, so "2 days ago" is worked out against it. */
  readAt: number
}

export type SocialPostsPage = {
  posts: SocialPostRow[]
  more: boolean
}

/** How many markets the right-hand panel lists. */
export const SOCIAL_MARKETS_SHOWN = 60

/**
 * Where a coin named in a post opens.
 *
 * **Always Hyperliquid**, because Hyperliquid's market list is what decided the
 * word was a coin at all. Pointing a $SOL chip at another exchange would be
 * Trade naming a venue the post never implied, and picking between venues is
 * the market picker's job.
 *
 * Worked out here rather than stored, so the row in `trade_social_post_coins`
 * stays venue-free: the post was about the coin, not about one exchange's
 * market in it.
 */
export function coinChartHref(coin: string): string | null {
  return marketChartHref(
    marketKey({ protocol: "hyperliquid", network: "mainnet", marketId: coin })
  )
}
