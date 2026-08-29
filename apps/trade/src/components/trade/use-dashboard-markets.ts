import * as React from "react"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { getMarketsErrorMessage, loadMarkets } from "@/lib/api/trade/markets"
import type { FilteredMarketCatalog } from "@/lib/trade/market-volume"

export type DashboardMarkets = {
  catalogs: FilteredMarketCatalog[]
  error: string | null
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
  const [seenFromLoader, setSeenFromLoader] = React.useState(fromLoader)
  if (seenFromLoader !== fromLoader) {
    setSeenFromLoader(fromLoader)
    setMarkets(fromLoader)
  }

  const retry = React.useCallback(() => {
    loadMarkets(protocol, network).then(
      (result) => setMarkets({ catalogs: result.catalogs, error: null }),
      (error: unknown) =>
        setMarkets((was) =>
          was.catalogs.length > 0
            ? was
            : { catalogs: [], error: getMarketsErrorMessage(error) }
        )
    )
  }, [protocol, network])

  return { markets, retry }
}
