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
 * its own markets, and is told which markets are wanted — one exchange here
 * has no all-markets feed and subscribes to them one at a time. An exchange without a hub answers null the same way a
 * quiet feed does — the caller falls back to asking the ordinary way, which
 * is correct, just rationed. The fallback is per wallet, so a wallet on an
 * exchange with no hub never degrades one on an exchange with one.
 *
 * **A quiet feed is not a feed.** An engine trading on a minute-old number
 * would be worse than one that waited, so a line that has gone silent answers
 * with nothing at all and the caller asks the ordinary way.
 *
 * **What it has, and what it is short of.** This used to answer all or
 * nothing: one market the line did not carry threw away every price it did
 * carry. That is not a rare edge. KuCoin is subscribed to per market and one
 * socket holds ninety of them, so a wallet on 454 KuCoin markets was short
 * every single pass, and the engine asked KuCoin for all 454 one at a time
 * instead — twelve seconds, measured, every pass, while ninety perfectly good
 * live prices sat unused. Now the caller gets both halves and asks only for
 * the markets that are genuinely missing.
 */
export function pushedMarks(marketKeys: readonly string[]): {
  marks: ReadonlyMap<string, number>
  /** Markets the open line cannot answer for. Empty means it covered them all. */
  missing: string[]
} {
  const nothing = { marks: new Map<string, number>(), missing: [...marketKeys] }
  if (marketKeys.length === 0) return { marks: new Map(), missing: [] }

  const lines = new Map<
    string,
    { protocol: ProtocolId; network: NetworkId; marketIds: string[] }
  >()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const line = `${ref.protocol}:${ref.network}`
    const found = lines.get(line)
    if (found) found.marketIds.push(ref.marketId)
    else
      lines.set(line, {
        protocol: ref.protocol,
        network: ref.network,
        marketIds: [ref.marketId],
      })
  }
  if (lines.size === 0) return nothing

  // Opening is free once it is open, so this doubles as "make sure the line
  // for the exchanges and networks we actually trade is up". A line that is
  // quiet is skipped entirely rather than half believed: its markets go on the
  // missing list and the caller asks for them.
  const quiet = new Set<string>()
  for (const [line, { protocol, network, marketIds }] of lines) {
    const hub = getProtocol(protocol).livePrices
    if (!hub) {
      quiet.add(line)
      continue
    }
    // The markets go with the request: an exchange with no all-markets feed
    // subscribes to exactly these, and the others ignore the list.
    hub.open(network, marketIds)
    if (!hub.fresh(network)) quiet.add(line)
  }

  // **Read once per line, not once per market.** An exchange whose feed runs on
  // several sockets has to merge them to answer, so `read` builds a list rather
  // than handing one over. Calling it inside the loop below rebuilt that list
  // for every market: 454 markets meant 454 rebuilds of a 454-market list on
  // every pass, about 10ms a second spent producing the same answer over and
  // over. Measured, then hoisted.
  const lists = new Map<string, ReadonlyMap<string, number>>()
  for (const [line, { protocol, network }] of lines) {
    if (quiet.has(line)) continue
    const hub = getProtocol(protocol).livePrices
    if (hub) lists.set(line, hub.read(network).prices)
  }

  const marks = new Map<string, number>()
  const missing: string[] = []
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) {
      missing.push(key)
      continue
    }
    const price = lists
      .get(`${ref.protocol}:${ref.network}`)
      ?.get(ref.marketId)
    // A market the line does not carry is a market this cannot answer for, and
    // it says so by name rather than by spoiling the rest of the answer.
    if (price !== undefined && price > 0) marks.set(key, price)
    else missing.push(key)
  }

  return { marks, missing }
}
