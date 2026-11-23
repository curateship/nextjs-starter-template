import * as React from "react"

import type { ProtocolId } from "@/lib/protocols/contracts"
import {
  CHART_INTERVALS,
  chartIntervalStorageKey,
  DEFAULT_CHART_INTERVAL,
  type ChartInterval,
} from "@/lib/trade/chart-interval"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

function isChartInterval(value: string | null): value is ChartInterval {
  return (
    value !== null && (CHART_INTERVALS as readonly string[]).includes(value)
  )
}

function readChartInterval(protocol: ProtocolId): ChartInterval {
  try {
    const saved = window.localStorage.getItem(chartIntervalStorageKey(protocol))
    if (isChartInterval(saved)) return saved
  } catch {
    // A browser that refuses localStorage still charts, on the default.
  }
  return DEFAULT_CHART_INTERVAL
}

/**
 * The chart's timeframe for one exchange, and the way to change it.
 *
 * The saved value cannot be read during the first render. The page is rendered
 * on the server too, where there is no localStorage, so reading it up front
 * would make the two renders disagree — React would report a hydration mismatch
 * and rebuild the page from scratch. Reading it a beat later, before the paint,
 * keeps the two renders identical and still beats the frame.
 *
 * Changing exchange re-reads, which is the whole point: the effect depends on
 * the protocol, so arriving at KuCoin shows KuCoin's own frame whether the page
 * was loaded there or walked to from Hyperliquid.
 */
export function useChartInterval(
  protocol: ProtocolId
): [ChartInterval, (next: ChartInterval) => void] {
  const [value, setValue] = React.useState<ChartInterval>(
    DEFAULT_CHART_INTERVAL
  )

  useEffectBeforePaint(() => {
    setValue(readChartInterval(protocol))
  }, [protocol])

  const choose = React.useCallback(
    (next: ChartInterval) => {
      setValue(next)
      try {
        window.localStorage.setItem(chartIntervalStorageKey(protocol), next)
      } catch {
        // The choice still holds for this visit; only the memory of it is lost.
      }
    },
    [protocol]
  )

  return [value, choose]
}
