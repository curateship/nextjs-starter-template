import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { namespaceMarketId, num } from "@/lib/protocols/hyperliquid/translate"
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
    client.allMids({ dex }).then((response) => midsSchema.parse(response))

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
