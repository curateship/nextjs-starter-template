import * as React from "react"

import { loadMarkets } from "@/lib/api/trade/markets"
import { parseMarketKey } from "@/lib/protocols/contracts"

/**
 * Each market's logo address, by market key, for the coins a backtest
 * tested. The run stores keys and symbols only, so the logos come from the
 * exchange's market list, read once per exchange the keys name. A list that
 * fails to load leaves the coins on their first-letter circle.
 */
export function useMarketIcons(marketKeys: readonly string[]): ReadonlyMap<string, string> {
  const [icons, setIcons] = React.useState<ReadonlyMap<string, string>>(EMPTY)

  // One string per exchange and network, so a live run adding coins does not
  // ask for the same list again.
  const venues = React.useMemo(() => {
    const seen = new Set<string>()
    for (const key of marketKeys) {
      const ref = parseMarketKey(key)
      if (ref) seen.add(`${ref.protocol}:${ref.network}`)
    }
    return [...seen].sort().join(",")
  }, [marketKeys])

  React.useEffect(() => {
    if (!venues) return
    let live = true
    for (const venue of venues.split(",")) {
      const ref = parseMarketKey(`${venue}:x`)
      if (!ref) continue
      loadMarkets(ref.protocol, ref.network).then(
        (result) => {
          if (!live) return
          setIcons((was) => {
            const next = new Map(was)
            for (const catalog of result.catalogs) {
              for (const row of [...catalog.rows, ...catalog.hiddenByVolumeRows]) {
                if (row.iconUrl) next.set(row.key, row.iconUrl)
              }
            }
            return next
          })
        },
        () => {}
      )
    }
    return () => {
      live = false
    }
  }, [venues])

  return icons
}

const EMPTY: ReadonlyMap<string, string> = new Map()
