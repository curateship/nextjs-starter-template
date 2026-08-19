import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { getProtocol } from "@/server/protocols/registry"

/**
 * Today's prices, taken off the open line rather than asked for.
 *
 * The trading engine's pass runs every second. Asking the exchange for prices
 * at that rate would be both rude and pointless: the same figures are already
 * being pushed to us about once a second, for every market at once. This turns
 * that stream into the shape `settleWallet` wants.
 *
 * Routed by the market key: each exchange's own `livePrices` hub answers for
 * its own markets. An exchange without a hub answers null the same way a
 * quiet feed does — the caller falls back to asking the ordinary way, which
 * is correct, just rationed. The fallback is per wallet, so a wallet on an
 * exchange with no hub never degrades one on an exchange with one.
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

  const lines = new Map<string, { protocol: ProtocolId; network: NetworkId }>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    lines.set(`${ref.protocol}:${ref.network}`, {
      protocol: ref.protocol,
      network: ref.network,
    })
  }
  if (lines.size === 0) return null

  // Opening is free once it is open, so this doubles as "make sure the line
  // for the exchanges and networks we actually trade is up". Every line must
  // exist and be fresh, or the whole answer is null — half an answer would
  // settle some of a wallet on live prices and the rest on nothing.
  for (const { protocol, network } of lines.values()) {
    const hub = getProtocol(protocol).livePrices
    if (!hub) return null
    hub.open(network)
    if (!hub.fresh(network)) return null
  }

  const marks = new Map<string, number>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const hub = getProtocol(ref.protocol).livePrices
    if (!hub) continue
    const price = hub.read(ref.network).prices.get(ref.marketId)
    if (price !== undefined && price > 0) marks.set(key, price)
  }

  // A market the feed does not carry is a market this cannot answer for.
  return marks.size === marketKeys.length ? marks : null
}
