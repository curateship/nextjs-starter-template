import * as React from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { TradeWorkspace } from "@/components/trade/trade-workspace"
import {
  getMarketsErrorMessage,
  loadMarketFavorites,
  loadMarkets,
} from "@/lib/api/markets"

/**
 * `?market=<key>` is which market the middle panel shows — a full market key
 * (`hyperliquid:mainnet:BTC`), so the address stays honest about the exchange
 * and a link keeps meaning the same market when a second protocol exists.
 * Checked before use and dropped when it is not usable.
 */
type TradeSearch = { market?: string }

function readTradeSearch(search: Record<string, unknown>): TradeSearch {
  return {
    market:
      typeof search.market === "string" && search.market.length <= 120
        ? search.market
        : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/trade")({
  validateSearch: readTradeSearch,
  loader: async () => {
    const [markets, favorites] = await Promise.all([
      // A dead exchange must not take the page down with it: the workspace
      // still opens, and the list explains itself and offers a retry.
      loadMarkets()
        .then((result) => ({ catalogs: result.catalogs, error: null }))
        .catch((error: unknown) => ({
          catalogs: [],
          error: getMarketsErrorMessage(error),
        })),
      // Losing the stars is cosmetic — an empty set just draws no stars.
      loadMarketFavorites().catch(() => ({ marketKeys: [] as string[] })),
    ])
    return { markets, favoriteKeys: favorites.marketKeys }
  },
  component: TradeRoute,
})

function TradeRoute() {
  const { markets, favoriteKeys } = Route.useLoaderData()
  const { market } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()

  // Stable on purpose: the workspace keys its live-feed effect on this, and
  // a fresh closure per render would resubscribe the feed on every market
  // click.
  const onRetryMarkets = React.useCallback(
    () => void router.invalidate(),
    [router]
  )

  return (
    <TradeWorkspace
      catalogs={markets.catalogs}
      marketsError={markets.error}
      initialFavoriteKeys={favoriteKeys}
      selectedKey={market ?? null}
      onSelectMarket={(key) =>
        void navigate({
          search: (current) => ({ ...current, market: key }),
          replace: true,
        })
      }
      onRetryMarkets={onRetryMarkets}
    />
  )
}
