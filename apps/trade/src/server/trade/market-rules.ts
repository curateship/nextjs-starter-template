import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { getProtocol } from "@/server/protocols/registry"

/**
 * A market's ground rules — how fine its sizes go, and the most leverage it
 * allows — for the practice engine, which needs both before it can accept an
 * order.
 *
 * These come from the whole market catalogue, which is several calls to the
 * exchange. Placing an order must not pay that price, and the rules barely
 * change from hour to hour, so one catalogue per protocol and network is kept
 * for a few minutes and shared by everything that asks.
 *
 * The rules are read here rather than taken from the browser on purpose: the
 * leverage limit is what the liquidation price is built from, so a request
 * claiming its own limit could claim a position was safer than it is.
 */

const CACHE_MS = 5 * 60_000

export type MarketRules = {
  sizeDecimals: number | null
  maxLeverage: number | null
}

type Entry = { at: number; rules: Map<string, MarketRules> }

const cache = new Map<string, Entry>()

/** Tests drive time themselves; a cache across them would leak between cases. */
export function clearMarketRulesCache(): void {
  cache.clear()
}

async function rulesFor(
  protocol: ProtocolId,
  network: NetworkId
): Promise<Map<string, MarketRules>> {
  const key = `${protocol}:${network}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rules

  const catalog = await getProtocol(protocol).markets.fetch(network)
  const rules = new Map<string, MarketRules>(
    catalog.rows.map((row) => [
      row.marketId,
      { sizeDecimals: row.sizeDecimals, maxLeverage: row.maxLeverage },
    ])
  )
  cache.set(key, { at: Date.now(), rules })
  return rules
}

/**
 * The rules for one market, or null when the exchange does not list it — a
 * market that cannot be found is refused, never guessed at.
 */
export async function marketRules(
  protocol: ProtocolId,
  network: NetworkId,
  marketId: string
): Promise<MarketRules | null> {
  const rules = await rulesFor(protocol, network)
  return rules.get(marketId) ?? null
}
