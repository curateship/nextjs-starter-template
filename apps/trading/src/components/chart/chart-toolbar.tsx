import type * as React from "react"

import { price as fmtPrice } from "@/components/backtest/backtest-format"
import type { ChartCandle } from "@/components/chart/price-chart"
import { CHIP_COLORS } from "@/components/chart/trade-chips"
import type { CandleInterval } from "@/lib/hl/ws"
import { cn } from "@/lib/utils"

/** Which mark types the chart is currently showing, for the legend. */
export type ChartLegendFlags = {
  /** Price-pinned O/C/F chips — real fills/trades (long / short / flip). */
  chips?: boolean
}

/** A colored-line legend entry (e.g. a breakout channel or VWAP band). */
export type ChartLegendLine = { id: string; color: string; label: string }

function LegendChip({
  color,
  letter,
  textColor,
}: {
  color: string
  letter?: string
  textColor?: string
}) {
  return (
    <span
      className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
      style={{ backgroundColor: color, color: textColor ?? "#fff" }}
    >
      {letter}
    </span>
  )
}

/**
 * The one chart toolbar every dashboard uses: timeframe buttons, a legend
 * explaining every mark the chart can show, the crosshair O/H/L/C readout,
 * and slots for page-specific extras. Do not build chart toolbars any other
 * way — see workspace/docs/chart-spec.md.
 */
export function ChartToolbar({
  intervals,
  interval,
  onIntervalChange,
  legend,
  legendLines = [],
  ohlc,
  leading,
  afterIntervals,
  children,
}: {
  intervals: readonly CandleInterval[]
  interval: CandleInterval
  onIntervalChange: (interval: CandleInterval) => void
  legend?: ChartLegendFlags
  /** Colored-line entries (overlay channels/bands) appended to the legend. */
  legendLines?: ChartLegendLine[]
  /** Hovered (or latest) candle for the O/H/L/C readout; null hides it. */
  ohlc?: ChartCandle | null
  /** Left-side extras (e.g. the market symbol). */
  leading?: React.ReactNode
  /** Extras right after the timeframe buttons (e.g. the Indicators menu). */
  afterIntervals?: React.ReactNode
  /** Right-side extras (menus, settings gear). */
  children?: React.ReactNode
}) {
  const legendItems: React.ReactNode[] = []
  if (legend?.chips) {
    legendItems.push(
      <span key="chips" className="flex items-center gap-1.5">
        <LegendChip color={CHIP_COLORS.long} />
        <span>long</span>
        <LegendChip color={CHIP_COLORS.short} />
        <span>short</span>
        <LegendChip color={CHIP_COLORS.flip} letter="F" textColor={CHIP_COLORS.flipText} />
        <span>flip</span>
      </span>
    )
  }
  return (
    <div className="flex items-center gap-3 border-b px-3 py-1.5">
      {leading}
      <div className="flex gap-0.5">
        {intervals.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => onIntervalChange(tf)}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              interval === tf && "bg-muted text-foreground"
            )}
          >
            {tf}
          </button>
        ))}
      </div>
      {afterIntervals}
      {legendItems.length > 0 || legendLines.length > 0 ? (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {legendItems}
            {legendLines.map((line) => (
              <span key={line.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-3.5 rounded"
                  style={{ background: line.color }}
                />
                <span className="font-mono">{line.label}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
      <div className="flex-1" />
      {ohlc ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          O {fmtPrice(Number(ohlc.o))} · H {fmtPrice(Number(ohlc.h))} · L{" "}
          {fmtPrice(Number(ohlc.l))} · C {fmtPrice(Number(ohlc.c))}
        </span>
      ) : null}
      {children}
    </div>
  )
}
