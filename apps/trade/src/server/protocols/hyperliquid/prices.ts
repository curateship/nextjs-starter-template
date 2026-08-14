import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { namespaceMarketId, num } from "@/lib/protocols/hyperliquid/translate"
import { isRateLimit } from "@/lib/trade/flow-waiting"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * Just the prices, for the markets that were asked about.
 *
 * The market list is the rich read — several calls, every venue, a day of
 * figures each. The practice engine only ever wants "what does this cost right
 * now" for the handful of markets a wallet is actually in, and this is the
 * cheap door for exactly that: one call per venue involved, nothing else.
 *
 * Read-only public data, like everything else in this folder.
 */

const midsSchema = z.record(z.string(), z.string())

type Mids = z.infer<typeof midsSchema>

/**
 * One venue answer serves every caller for a beat. The exchange rations
 * requests per address (testnet especially), and the polls that keep the
 * screens fresh can spend the ration right when an order needs a price —
 * a 429 at that moment refused real orders during the funded test run.
 * Two seconds is far inside the 3% cap a market order carries anyway.
 */
const MIDS_CACHE_MS = 2_000
const midsCache = new Map<string, { at: number; answer: Promise<Mids | null> }>()

/**
 * How long "it was a rate limit" is worth remembering, in ms.
 *
 * Only long enough for the caller that asked for the price to still be the one
 * asking why it did not get one.
 */
const WHY_REMEMBERED_MS = 30_000

/** When a venue was last refused for asking too often. */
const rationedAt = new Map<string, number>()

/**
 * Whether this venue's last missing price was the exchange rationing us.
 *
 * **Why a caller needs to know.** A missing price has two completely different
 * meanings: the exchange does not price this market — which is permanent and
 * somebody's problem — or it is asking us to slow down, which is temporary and
 * nobody's. Both arrived as the same silence, so a rate limit spent an hour on
 * screen as "the exchange would not give a price for this coin", sending
 * somebody hunting for a delisted market that was trading perfectly well.
 */
export function pricesWereRationed(network: NetworkId, marketId: string): boolean {
  const at = rationedAt.get(`${network}:${dexOf(marketId)}`)
  return at !== undefined && Date.now() - at < WHY_REMEMBERED_MS
}

/**
 * One venue's mids: cached, deduplicated, and given one second chance on a
 * dropped call. The cache holds the PROMISE, so two callers asking in the
 * same cold moment — the practice settle and a real order placing, say —
 * spend one request between them, not two. A failed answer takes itself out
 * of the cache so the next caller retries instead of inheriting the miss.
 */
function venueMids(network: NetworkId, dex: string): Promise<Mids | null> {
  const cacheKey = `${network}:${dex}`
  const cached = midsCache.get(cacheKey)
  if (cached && Date.now() - cached.at < MIDS_CACHE_MS) return cached.answer

  const client = infoClient(network)
  const ask = () =>
    client
      .allMids({ dex })
      .then((response) => midsSchema.parse(response))
      .catch((error: unknown) => {
        // Noted before it is turned into silence, so the caller can tell a
        // rationed answer from a market the exchange does not price.
        const message = error instanceof Error ? error.message : String(error)
        if (isRateLimit(message)) rationedAt.set(cacheKey, Date.now())
        throw error
      })

  const at = Date.now()
  const answer = (async (): Promise<Mids | null> => {
    let mids: Mids | null = await ask().catch(() => null)
    if (mids === null) {
      // Once more after a beat — rationing eases within a second. Still
      // failing after that is an honest "no price", never a guess.
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      mids = await ask().catch(() => null)
    }
    // Only this attempt's own entry is evicted — a newer one stays.
    if (mids === null && midsCache.get(cacheKey)?.at === at) {
      midsCache.delete(cacheKey)
    }
    return mids
  })()
  midsCache.set(cacheKey, { at, answer })
  return answer
}

/** Which venue a market id belongs to — the half before the colon, or the main one. */
function dexOf(marketId: string): string {
  const colon = marketId.indexOf(":")
  return colon > 0 ? marketId.slice(0, colon) : ""
}

/**
 * Today's price for each of these markets, keyed by the same ids that went in.
 *
 * A venue that will not answer simply contributes no prices: the caller sees
 * markets missing from the map and can leave those alone, which is the honest
 * outcome. Inventing a price for a market the exchange would not price is the
 * one thing this must never do.
 */
export async function fetchHyperliquidPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const wanted = new Set(marketIds)
  const dexes = new Set(marketIds.map(dexOf))

  const answers = await Promise.all(
    [...dexes].map(async (dex) => {
      const mids = await venueMids(network, dex)
      return mids === null ? null : { dex, mids }
    })
  )

  const prices = new Map<string, number>()
  for (const answer of answers) {
    if (!answer) continue
    for (const [name, value] of Object.entries(answer.mids)) {
      // The exchange names a sub-exchange's coins inconsistently — sometimes
      // already prefixed, sometimes bare. `namespaceMarketId` is the one rule
      // that settles it, the same rule the market list is built with.
      const marketId = namespaceMarketId(answer.dex, name)
      if (!wanted.has(marketId)) continue
      const price = num(value)
      if (price !== null && price > 0) prices.set(marketId, price)
    }
  }
  return prices
}
