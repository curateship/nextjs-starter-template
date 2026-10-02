import type { MarketCategory, ProtocolId } from "@/lib/protocols/contracts"
import {
  buildCoinMatchList,
  type CoinMatchList,
  type MarketMatchKind,
  type MarketToMatch,
} from "@/lib/trade/social/coin-matcher"
import {
  loadHeldPromise,
  type TimedPromise,
} from "@/lib/protocols/promise-cache"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"

/**
 * The list of markets a post is allowed to name.
 *
 * **The coins are Hyperliquid's own**, which is the app's one real list of
 * every coin it trades. A coin with no market here can never come out of the
 * matcher, so the counts on a creator's dashboard are always coins you could
 * go and trade.
 *
 * **The stocks, metals and currencies come from edgeX and ApeX Omni**, the two
 * venues whose listed contracts Trade reads cheaply. They are only read when
 * the member switched stocks on in Settings → Social, which starts off.
 * Robinhood Chain's stock tokens are left out: its market list is a forty-page
 * walk of the chain's logs, far too much to pay for reading words, so a stock
 * only Robinhood lists is not matched.
 *
 * **The markets other groups host on Hyperliquid are left out**, the same cut
 * the price converter makes. Those share a coin's name while being something
 * else, and the two venues above list the same stocks properly.
 *
 * Held for an hour rather than rebuilt per post, with coins and
 * coins-and-stocks held as two separate lists so flipping the switch does not
 * cost the other members their held one. A new listing therefore takes up to
 * an hour to become matchable, and posts stored before it was listed stay
 * unmatched until the pass in `social-post-coins.ts` runs over them again.
 */
const HOLD_FOR_MS = 60 * 60_000

/** Where the coins come from, and the only venue a coin chip ever opens. */
const COIN_VENUE: ProtocolId = "hyperliquid"

/**
 * Where the stocks, metals and currencies come from, in the order a ticker is
 * claimed. edgeX first because it lists the most and trades them;
 * ApeX Omni lists its stock contracts without trading them.
 */
const STOCK_VENUES: readonly ProtocolId[] = ["edgex", "apex"]

/** An exchange's own word for a kind of market, in the screen's words. */
const KIND_OF_CATEGORY: Partial<Record<MarketCategory, MarketMatchKind>> = {
  crypto: "coin",
  stocks: "stock",
  commodities: "commodity",
  forex: "currency",
}

const held = new Map<string, TimedPromise<CoinMatchList>>()

/**
 * The match list, with stocks only if this member asked for them.
 *
 * **One venue refusing refuses the whole list.** A list built from two of
 * three venues would quietly store "this post names nothing" for a stock the
 * missing venue lists, and a stored answer like that stays wrong until
 * somebody presses Re-read. Refusing leaves every stored answer alone and says
 * what happened, which is the same choice the coin list has always made.
 */
export function loadMarketMatchList(
  includeStocks: boolean
): Promise<CoinMatchList> {
  return loadHeldPromise(
    held,
    includeStocks ? "coins-and-stocks" : "coins",
    (at) => Date.now() - at < HOLD_FOR_MS,
    async () => {
      const coins = await marketsOfVenue(COIN_VENUE, ["coin"])
      if (!includeStocks) return buildCoinMatchList(coins)

      const stocks = await Promise.all(
        STOCK_VENUES.map((venue) =>
          marketsOfVenue(venue, ["stock", "commodity", "currency"])
        )
      )
      // Coins first, so a stock venue listing a coin's ticker never takes it.
      return buildCoinMatchList([coins, ...stocks].flat())
    }
  )
}

/** One venue's markets of the wanted kinds, on its main exchange only. */
async function marketsOfVenue(
  venue: ProtocolId,
  kinds: readonly MarketMatchKind[]
): Promise<MarketToMatch[]> {
  const catalog = await loadRawMarketCatalog(venue, "mainnet")
  const wanted = new Set(kinds)
  return catalog.rows.flatMap((row) => {
    if (row.subExchange !== null) return []
    const kind = KIND_OF_CATEGORY[row.category]
    if (!kind || !wanted.has(kind)) return []
    return [{ symbol: row.symbol, key: row.key, kind }]
  })
}
