import * as React from "react"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
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

  return { markets, retry }
}
