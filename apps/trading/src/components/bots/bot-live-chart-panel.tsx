import * as React from "react"

import {
  formatFocusDays,
  pct,
  signedUsd,
} from "@/components/backtest/backtest-format"
import { buildBotFillMarkers } from "@/components/bots/bot-chart-overlays"
import type { BotRoundTrip } from "@/components/bots/bot-round-trips"
import type { BotDetailResponse } from "@/lib/api/bots"
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
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"

/**
 * The live chart of one bot market: real candles, fill chips, trade focus,
 * and any caller-supplied price lines (draggable TP/SL). The chart interval
 * is panel-local; lifecycle controls arrive via `toolbarActions` and sit
 * where the OHLC readout would.
 */
export function BotLiveChartPanel({
  network,
  market,
  defaultInterval,
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
  defaultInterval: CandleInterval
  /** Compiled config for the indicator paint (same as the canvas). */
  automationConfig: AutomationConfig | null
  /** Raw fills of this market (chart chips). */
  fills: BotDetailResponse["trades"]
  trips: BotRoundTrip[]
  /** Trade number selected in the bottom panel — pulses entry/exit rings. */
  focusedTradeN: number | null
  priceLines?: ChartPriceLine[]
  onLineDragEnd?: (id: string, price: number) => void
  toolbarActions?: React.ReactNode
}) {
  const [interval, setInterval] = React.useState<CandleInterval>(defaultInterval)
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

  const focusPoints = React.useMemo<ChartFocusPoint[]>(() => {
    if (!focusedTrip) return []
    const long = focusedTrip.side === "long"
    const snap = (ms: number) => Math.floor(ms / intervalMs) * intervalMs
    const points: ChartFocusPoint[] = [
      {
        time: snap(focusedTrip.entryTime),
        side: long ? "buy" : "sell",
        label: "Entry",
        price: focusedTrip.entryPx,
      },
    ]
    if (focusedTrip.exitTime != null && focusedTrip.exitPx != null) {
      points.push({
        time: snap(focusedTrip.exitTime),
        side: long ? "sell" : "buy",
        label: "Exit",
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
      pctText: pct(focusedTrip.returnPct),
      pnlText: signedUsd(focusedTrip.pnl),
      bars: Math.max(1, Math.round(spanMs / intervalMs)),
      daysText: formatFocusDays(spanMs / 86_400_000),
    }
  }, [focusedTrip, intervalMs])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <ChartToolbar
        intervals={CANDLE_INTERVALS}
        interval={interval}
        onIntervalChange={setInterval}
        legend={{ chips: markers.length > 0 }}
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
