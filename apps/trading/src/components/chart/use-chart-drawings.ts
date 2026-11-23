import * as React from "react"

import { loadChartDrawings, saveChartDrawings } from "@/lib/api/chart-drawings"
import {
  cacheChartDrawings,
  EMPTY_CHART_DRAWINGS,
  type ChartDrawings,
} from "@/lib/trading/chart-drawings"
import type { TradingNetwork } from "@/lib/hl/network"

/**
 * Saved drawings for one market, shared by every chart that can draw.
 *
 * Trendlines and long/short position drawings are stored per network+market, so
 * anything drawn on the live chart is what the backtest chart shows for that
 * market. Local edits win over a slower in-flight load, and saves are queued so
 * a rapid edit sequence cannot land out of order.
 */
export function useChartDrawings({
  network,
  market,
  onPersistenceError,
}: {
  network: TradingNetwork
  market: string
  onPersistenceError?: (action: "load" | "save") => void
}) {
  const drawingKey = `${network}:${market}`
  const [savedByChart, setSavedByChart] = React.useState(
    () => new Map<string, ChartDrawings>()
  )
  const dirtyKeysRef = React.useRef(new Set<string>())
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    let cancelled = false
    void loadChartDrawings({ network, market })
      .then((drawings) => {
        if (!cancelled && !dirtyKeysRef.current.has(drawingKey)) {
          setSavedByChart((current) =>
            cacheChartDrawings(current, drawingKey, drawings)
          )
        }
      })
      .catch(() => {
        if (!cancelled) onPersistenceError?.("load")
      })
    return () => {
      cancelled = true
    }
  }, [drawingKey, network, market, onPersistenceError])

  const drawings = savedByChart.get(drawingKey) ?? EMPTY_CHART_DRAWINGS

  const onDrawingsChange = React.useCallback(
    (next: ChartDrawings) => {
      dirtyKeysRef.current.add(drawingKey)
      setSavedByChart((current) =>
        cacheChartDrawings(current, drawingKey, next)
      )
    },
    [drawingKey]
  )

  const onDrawingsCommit = React.useCallback(
    (next: ChartDrawings) => {
      const input = { network, market, ...next }
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          await saveChartDrawings(input)
        } catch {
          onPersistenceError?.("save")
        }
      })
    },
    [network, market, onPersistenceError]
  )

  return { drawings, onDrawingsChange, onDrawingsCommit }
}
