import * as React from "react"

import {
  parseMarketKey,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { getMarketsErrorMessage, loadMarkets } from "@/lib/api/trade/markets"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"

export type DashboardMarkets = {
  catalogs: FilteredMarketCatalog[]
  error: string | null
  /**
   * The exchange half of the opening answer has not landed yet. The list
   * shows a loading row rather than claiming the exchange lists nothing.
   */
  pending: boolean
}

/**
 * The dashboard's market list, and a way to ask for it again.
 *
 * The route loader fetches the list once with everything else the page
 * needs. Asking again — the Retry link in an empty list, or the live feed
 * catching up after a gap — used to re-run the whole loader, which meant
 * re-reading every preference as well. A catch-up on a flaky connection did
 * that every few seconds. Now a retry asks for the market list alone.
 *
 * A retry that fails keeps the list already on screen. Only a list that was
 * empty to begin with shows the error.
 *
 * A fresh loader answer whose exchange half is still streaming keeps the
 * list already on screen too — but only on the same network. Another
 * network's markets are a different list, and holding the old one up while
 * the new one loads would be showing the wrong exchange floor.
 */
export function useDashboardMarkets(
  fromLoader: DashboardMarkets,
  protocol: ProtocolId,
  network: NetworkId
) {
  const [markets, setMarkets] = React.useState(fromLoader)
  // A new loader answer (the network changed, or the page was revisited
  // after its data went stale) replaces whatever a retry put here. Kept in
  // state rather than a ref so the comparison happens in render, the way
  // React's own "derived state" pattern does it.
  const [seen, setSeen] = React.useState({ fromLoader, network })
  if (seen.fromLoader !== fromLoader || seen.network !== network) {
    const keepShown =
      fromLoader.pending &&
      seen.network === network &&
      markets.catalogs.length > 0
    setSeen({ fromLoader, network })
    if (!keepShown) setMarkets(fromLoader)
  }

  /**
   * Markets found by a lookup on the venue, kept for the session. They are
   * folded into whatever list is on screen rather than written into it, so
   * a retry or a fresh loader answer cannot lose them. A row for another
   * exchange or network has nowhere to go and is dropped.
   */
  const [found, setFound] = React.useState<MarketRow[]>([])
  const addRows = React.useCallback((rows: readonly MarketRow[]) => {
    setFound((was) => {
      const keys = new Set(was.map((row) => row.key))
      const fresh = rows.filter((row) => {
        const ref = parseMarketKey(row.key)
        return (
          ref !== null &&
          ref.protocol === protocol &&
          ref.network === network &&
          !keys.has(row.key)
        )
      })
      return fresh.length === 0 ? was : [...was, ...fresh]
    })
  }, [network, protocol])

  const shown = React.useMemo<DashboardMarkets>(() => {
    if (found.length === 0) return markets
    return {
      ...markets,
      catalogs: markets.catalogs.map((catalog) => {
        if (catalog.protocol !== protocol || catalog.network !== network) {
          return catalog
        }
        const listed = new Set([
          ...catalog.rows.map((row) => row.key),
          ...catalog.hiddenByVolumeRows.map((row) => row.key),
        ])
        const extra = found.filter((row) => !listed.has(row.key))
        return extra.length === 0
          ? catalog
          : { ...catalog, rows: [...catalog.rows, ...extra] }
      }),
    }
  }, [found, markets, network, protocol])

  const retry = React.useCallback(() => {
    loadMarkets(protocol, network).then(
      (result) =>
        setMarkets({ catalogs: result.catalogs, error: null, pending: false }),
      (error: unknown) =>
        setMarkets((was) =>
          was.catalogs.length > 0
            ? was
            : {
                catalogs: [],
                error: getMarketsErrorMessage(error),
                pending: false,
              }
        )
    )
  }, [protocol, network])

  return { markets: shown, retry, addRows }
}
