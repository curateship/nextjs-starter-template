import * as React from "react"

import {
  CANDLE_INTERVALS,
  type CandleInterval,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  chartIntervalStorageKey,
  DEFAULT_CHART_INTERVAL,
} from "@/lib/trade/chart-interval"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

function isCandleInterval(value: string | null): value is CandleInterval {
  return (
    value !== null && (CANDLE_INTERVALS as readonly string[]).includes(value)
  )
}

function readChartInterval(protocol: ProtocolId): CandleInterval {
  try {
    const saved = window.localStorage.getItem(chartIntervalStorageKey(protocol))
    if (isCandleInterval(saved)) return saved
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
): [CandleInterval, (next: CandleInterval) => void] {
  const [value, setValue] = React.useState<CandleInterval>(
    DEFAULT_CHART_INTERVAL
  )

  useEffectBeforePaint(() => {
    setValue(readChartInterval(protocol))
  }, [protocol])

  const choose = React.useCallback(
    (next: CandleInterval) => {
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
