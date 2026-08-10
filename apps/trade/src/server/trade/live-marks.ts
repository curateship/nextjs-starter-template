import { parseMarketKey, type NetworkId } from "@/lib/protocols/contracts"
import {
  livePrices,
  livePricesFresh,
  openLivePrices,
} from "@/server/protocols/hyperliquid/live-prices"

/**
 * Today's prices, taken off the open line rather than asked for.
 *
 * The trading engine's pass runs every second. Asking the exchange for prices
 * at that rate would be both rude and pointless: the same figures are already
 * being pushed to us about once a second, for every market at once. This turns
 * that stream into the shape `settleWallet` wants.
 *
 * **Null means "do not use me".** A feed that has gone quiet is not a feed,
 * and an engine that traded on a minute-old number would be worse than one
 * that waited. The caller falls back to asking the ordinary way, which is
 * exactly what happened before this existed.
 */
export function pushedMarks(
  marketKeys: readonly string[]
): ReadonlyMap<string, number> | null {
  if (marketKeys.length === 0) return null

  const networks = new Set<NetworkId>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (ref) networks.add(ref.network)
  }
  if (networks.size === 0) return null

  // Opening is free once it is open, so this doubles as "make sure the line
  // for the networks we actually trade is up".
  for (const network of networks) openLivePrices(network)
  for (const network of networks) {
    if (!livePricesFresh(network)) return null
  }

  const marks = new Map<string, number>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const price = livePrices(ref.network).prices.get(ref.marketId)
    if (price !== undefined && price > 0) marks.set(key, price)
  }

  // A market the feed does not carry is a market this cannot answer for. Half
  // an answer would settle some of a wallet on live prices and the rest on
  // nothing, so the whole thing goes back to being asked for.
  return marks.size === marketKeys.length ? marks : null
}
