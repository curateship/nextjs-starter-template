import {
  parseMarketKey,
  protocolLabel,
  type MarketKey,
} from "@/lib/protocols/contracts"
import { historySourceFor } from "@/lib/protocols/history-source"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"

/**
 * The source that really holds a market's history, confirmed.
 *
 * `historySourceFor` is a naming rule: it says what a market would be called
 * on Binance or Dukascopy. A venue that states no category, which is
 * Lighter, hands over names like KIOXIA that the rule can only send to
 * Binance, and Binance has never listed them. So the name is checked against
 * the source's own catalogue before anything is fetched under it. Both
 * catalogues are already cached in memory, so the check costs no request.
 *
 * Null means the market keeps its own key: its chart shows what the venue
 * has, and the backtest picker says "history from the exchange only".
 */
export async function resolveHistorySource(
  key: MarketKey
): Promise<MarketKey | null> {
  const candidate = historySourceFor(key)
  if (!candidate) return null
  const ref = parseMarketKey(candidate)
  if (!ref) return null
  const catalog = await loadRawMarketCatalog(ref.protocol, ref.network)
  return catalog.rows.some((row) => row.key === candidate) ? candidate : null
}

/** The source's printed name, for the chart header and the results page. */
export function sourceLabelOf(sourceKey: MarketKey): string {
  const ref = parseMarketKey(sourceKey)
  return ref ? protocolLabel(ref.protocol) : sourceKey
}
