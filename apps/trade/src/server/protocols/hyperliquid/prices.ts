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
  const client = infoClient(network)

  const answers = await Promise.all(
    [...dexes].map((dex) =>
      client
        .allMids({ dex })
        .then((response) => ({ dex, mids: midsSchema.parse(response) }))
        .catch(() => null)
    )
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
