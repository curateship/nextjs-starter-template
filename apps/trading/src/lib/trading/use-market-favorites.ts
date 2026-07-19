import * as React from "react"

import { usePersistedState } from "@/lib/use-persisted-state"

const MARKET_FAVORITES_KEY = "trading-favorite-markets"
const EMPTY_MARKET_FAVORITES: string[] = []

/**
 * Starred markets, shared by every market picker (trade terminal, backtest and
 * bot panels) so a market starred in one place is starred everywhere.
 */
export function useMarketFavorites() {
  const [list, setList] = usePersistedState<string[]>(
    MARKET_FAVORITES_KEY,
    EMPTY_MARKET_FAVORITES
  )
  const favorites = React.useMemo(() => new Set(list), [list])
  const toggleFavorite = React.useCallback(
    (coin: string) => {
      setList((current) =>
        current.includes(coin)
          ? current.filter((item) => item !== coin)
          : [...current, coin]
      )
    },
    [setList]
  )
  return { favorites, toggleFavorite }
}
