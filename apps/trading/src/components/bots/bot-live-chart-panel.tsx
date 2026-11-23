import * as React from "react"

import {
  formatFocusDays,
  signedPct,
  signedUsd,
} from "@/lib/format"
import { buildBotFillMarkers } from "@/components/bots/bot-chart-overlays"
import type {
  BotRoundTrip,
  RoundTripFill,
} from "@/components/bots/bot-round-trips"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import {
  PriceChart,
  type ChartFocusPoint,
  type ChartFocusResult,
  type ChartMarker,
  type ChartPriceLine,
} from "@/components/chart/price-chart"
import { candleIntervalMs } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"

/**
 * The live chart of one bot market: real candles, fill chips, trade focus,
 * and any caller-supplied price lines (draggable TP/SL). By default the
 * interval is dictated by the automation's setting and locked here — the
 * toolbar shows it but cannot change it — so the chart always tracks the saved
 * timeframe. Pass `intervals` + `onIntervalChange` to unlock the picker, which
 * the trade journal does: a real trade has no saved timeframe, so the reviewer
 * chooses one. Lifecycle controls arrive via `toolbarActions` and sit where
 * the OHLC readout would.
 */
export function BotLiveChartPanel({
  network,
  market,
  interval,
  intervals,
  onIntervalChange,
  automationConfig,
  fills,
  trips,
  focusedTradeN,
  priceLines = [],
  onLineDragEnd,
  toolbarActions,
}: {
  network: TradingNetwork
  market: string
  /** The automation's saved candle interval; the chart is locked to it. */
  interval: CandleInterval
  /** Selectable timeframes; omit to lock the chart to `interval`. */
  intervals?: readonly CandleInterval[]
  onIntervalChange?: (interval: CandleInterval) => void
  /** Compiled config for the indicator paint (same as the canvas). */
  automationConfig: AutomationConfig | null
  /** Raw fills of this market (chart chips). */
  fills: RoundTripFill[]
  trips: BotRoundTrip[]
  /** Trade number selected in the bottom panel — pulses entry/exit rings. */
  focusedTradeN: number | null
  priceLines?: ChartPriceLine[]
  onLineDragEnd?: (id: string, price: number) => void
  toolbarActions?: React.ReactNode
}) {
  const intervalMs = candleIntervalMs(interval)

  // Price-pinned O/C chips for recent fills, snapped to candle buckets.
  const markers = React.useMemo<ChartMarker[]>(
    () => buildBotFillMarkers(fills.slice(0, 200), intervalMs),
    [fills, intervalMs]
  )

  const focusedTrip =
    focusedTradeN !== null
      ? (trips.find((trip) => trip.n === focusedTradeN) ?? null)
      : null

  // Entry and exit of the focused trade: they position the result box and pan
  // the trade into view. An open trade has only an entry, so no box — the fill
  // chip already marks it.
  const focusPoints = React.useMemo<ChartFocusPoint[]>(() => {
    if (!focusedTrip) return []
    const snap = (ms: number) => Math.floor(ms / intervalMs) * intervalMs
    const points: ChartFocusPoint[] = [
      { time: snap(focusedTrip.entryTime), price: focusedTrip.entryPx },
    ]
    if (focusedTrip.exitTime != null && focusedTrip.exitPx != null) {
      points.push({
        time: snap(focusedTrip.exitTime),
        price: focusedTrip.exitPx,
      })
    }
    return points
  }, [focusedTrip, intervalMs])

  const focusResult = React.useMemo<ChartFocusResult | null>(() => {
    if (!focusedTrip || focusedTrip.exitTime == null) return null
    const spanMs = focusedTrip.exitTime - focusedTrip.entryTime
    return {
      up: focusedTrip.pnl >= 0,
      pctText: signedPct(focusedTrip.returnPct),
      pnlText: signedUsd(focusedTrip.pnl),
      bars: Math.max(1, Math.round(spanMs / intervalMs)),
      daysText: formatFocusDays(spanMs / 86_400_000),
    }
  }, [focusedTrip, intervalMs])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <ChartToolbar
        intervals={intervals ?? [interval]}
        interval={interval}
        onIntervalChange={onIntervalChange ?? (() => {})}
        leading={<span className="text-sm font-bold">{market}</span>}
      >
        {toolbarActions}
      </ChartToolbar>
      <div className="min-h-0 flex-1">
        <PriceChart
          network={network}
          coin={market}
          interval={interval}
          priceLines={priceLines}
          markers={markers}
          automationConfig={automationConfig}
          focusPoints={focusPoints}
          focusResult={focusResult}
          onLineDragEnd={onLineDragEnd}
        />
      </div>
    </div>
  )
}
