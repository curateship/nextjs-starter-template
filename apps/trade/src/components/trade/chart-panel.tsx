import * as React from "react"
import { CandlestickChartIcon } from "lucide-react"

import { PanelPlaceholder } from "@/components/trade/panel-placeholder"
import { PriceChart } from "@/components/trade/price-chart"
import { ErrorBanner } from "@/components/ui/error-banner"
import { getCandlesErrorMessage, loadCandles } from "@/lib/api/candles"
import {
  CANDLE_INTERVALS,
  type CandleBar,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import { cn } from "@/lib/utils"

/**
 * The timeframe row. It draws in the middle panel's header — the workspace
 * owns the remembered choice and hands it to both this picker and the chart's
 * fetch, so the two can never disagree.
 */
export function IntervalPicker({
  value,
  onChange,
}: {
  value: CandleInterval
  onChange: (next: CandleInterval) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {CANDLE_INTERVALS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex h-6 items-center rounded-md px-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === option
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/**
 * The middle of the middle panel: the picked market's price history.
 *
 * This panel owns the fetching and the honest states; `PriceChart` under it
 * only ever sees candles. Data arrives per market-and-interval, and a stale
 * answer — one that lands after another market was picked — is dropped on the
 * floor rather than drawn over the wrong chart.
 */
export function ChartPanel({
  selectedKey,
  interval,
}: {
  selectedKey: string | null
  interval: CandleInterval
}) {
  // Only ever written from the fetch's callbacks. "Loading" is not stored:
  // an answer whose key does not match what is wanted right now IS the
  // loading state, so it cannot drift out of step with reality.
  const [answer, setAnswer] = React.useState<{
    /** Which market-and-interval these candles belong to. */
    key: string
    candles: CandleBar[]
    error: string | null
  } | null>(null)
  // Bumped by the retry button; the fetch effect depends on it.
  const [attempt, setAttempt] = React.useState(0)

  const wanted = selectedKey ? `${selectedKey}@${interval}` : null

  React.useEffect(() => {
    if (!selectedKey || !wanted) return
    let stale = false
    loadCandles(selectedKey, interval)
      .then(({ candles }) => {
        if (stale) return
        setAnswer({ key: wanted, candles, error: null })
      })
      .catch((error: unknown) => {
        if (stale) return
        setAnswer({
          key: wanted,
          candles: [],
          error: getCandlesErrorMessage(error),
        })
      })
    return () => {
      stale = true
    }
  }, [selectedKey, interval, wanted, attempt])

  if (!selectedKey) {
    return (
      <PanelPlaceholder
        icon={<CandlestickChartIcon className="size-4" />}
        title="The chart goes here"
      >
        Pick a market on the left and its candles draw in this space.
      </PanelPlaceholder>
    )
  }

  const current = answer && answer.key === wanted ? answer : null

  return (
    <div className="relative h-full min-h-0">
      {!current ? (
        <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading candles…
        </p>
      ) : current.error ? (
        <div className="p-3">
          <ErrorBanner
            message={current.error}
            onRetry={() => setAttempt((count) => count + 1)}
          />
        </div>
      ) : current.candles.length === 0 ? (
        <PanelPlaceholder
          icon={<CandlestickChartIcon className="size-4" />}
          title="No candles here yet"
        >
          The exchange has no price history for this market at this timeframe.
        </PanelPlaceholder>
      ) : (
        <PriceChart candles={current.candles} />
      )}
    </div>
  )
}
