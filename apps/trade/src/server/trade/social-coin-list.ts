import {
  buildCoinMatchList,
  type CoinMatchList,
} from "@/lib/trade/social/coin-matcher"
import {
  loadHeldPromise,
  type TimedPromise,
} from "@/lib/protocols/promise-cache"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"

/**
 * The list of coins a post is allowed to name.
 *
 * It is Hyperliquid's own coins, which is the app's one real list of every coin
 * it trades (`loadRawMarketCatalog`). A coin with no market here can never come
 * out of the matcher, so the counts on a creator's dashboard are always coins
 * you could go and trade.
 *
 * **The markets other groups host on Hyperliquid are left out**, the same cut
 * the price converter makes. Those are stocks and indexes, some of them sharing
 * a coin's name, and stocks are their own job later on.
 *
 * Held for an hour rather than rebuilt per post. A new listing therefore takes
 * up to an hour to become matchable, and posts stored before it was listed stay
 * unmatched until the pass in `social-post-coins.ts` runs over them again.
 */
const HOLD_FOR_MS = 60 * 60_000

const held = new Map<string, TimedPromise<CoinMatchList>>()

export function loadCoinMatchList(): Promise<CoinMatchList> {
  return loadHeldPromise(
    held,
    "hyperliquid:mainnet",
    (at) => Date.now() - at < HOLD_FOR_MS,
    async () => {
      const catalog = await loadRawMarketCatalog("hyperliquid", "mainnet")
      return buildCoinMatchList(
        catalog.rows
          .filter(
            (row) => row.subExchange === null && row.category === "crypto"
          )
          .map((row) => row.symbol)
      )
    }
  )
}
