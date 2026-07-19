import * as React from "react"

import {
  loadChartTrendlines,
  saveChartTrendlines,
} from "@/lib/api/chart-trendlines"
import { cacheTrendlines, type Trendline } from "@/lib/trading/trendlines"
import type { TradingNetwork } from "@/lib/hl/network"

const EMPTY_TRENDLINES: Trendline[] = []

/**
 * Saved drawings for one market, shared by every chart that can draw.
 *
 * Trendlines are stored per network+market, so a line drawn on the live chart
 * is the same line the backtest chart shows for that market. Local edits win
 * over a slower in-flight load, and saves are queued so a rapid edit sequence
 * cannot land out of order.
 */
export function useChartTrendlines({
  network,
  market,
  onPersistenceError,
}: {
  network: TradingNetwork
  market: string
  onPersistenceError?: (action: "load" | "save") => void
}) {
  const trendlineKey = `${network}:${market}`
  const [savedByChart, setSavedByChart] = React.useState(
    () => new Map<string, Trendline[]>()
  )
  const dirtyKeysRef = React.useRef(new Set<string>())
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    let cancelled = false
    void loadChartTrendlines({ network, market })
      .then((trendlines) => {
        if (!cancelled && !dirtyKeysRef.current.has(trendlineKey)) {
          setSavedByChart((current) =>
            cacheTrendlines(current, trendlineKey, trendlines)
          )
        }
      })
      .catch(() => {
        if (!cancelled) onPersistenceError?.("load")
      })
    return () => {
      cancelled = true
    }
  }, [trendlineKey, network, market, onPersistenceError])

  const trendlines = savedByChart.get(trendlineKey) ?? EMPTY_TRENDLINES

  const onTrendlinesChange = React.useCallback(
    (next: Trendline[]) => {
      dirtyKeysRef.current.add(trendlineKey)
      setSavedByChart((current) =>
        cacheTrendlines(current, trendlineKey, next)
      )
    },
    [trendlineKey]
  )

  const onTrendlinesCommit = React.useCallback(
    (next: Trendline[]) => {
      const input = { network, market, trendlines: next }
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          await saveChartTrendlines(input)
        } catch {
          onPersistenceError?.("save")
        }
      })
    },
    [network, market, onPersistenceError]
  )

  return { trendlines, onTrendlinesChange, onTrendlinesCommit }
}
