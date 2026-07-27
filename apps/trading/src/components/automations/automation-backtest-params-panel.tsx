import * as React from "react"

import { BacktestGroupKpis, BacktestKpis } from "@/components/backtest/backtest-kpis"
import type { CombinedBacktestSummary } from "@/components/backtest/backtest-combine"
import { windowDaysOf } from "@/components/backtest/backtest-format"
import { PnlCurveCard } from "@/components/backtest/pnl-curve-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BacktestDetail } from "@/lib/api/backtests"
import type {
  GroupCombinedCurve,
  GroupOpenPositions,
} from "@/lib/backtest/types"
import { isManualRunParams } from "@/lib/backtest/manual-types"
import type { AutomationBacktestSettings } from "@/lib/automations/automation"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import {
  automationInputRows,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"

/**
 * The editor's left panel while backtest mode is on: the run's headline
 * numbers, the whole basket's P&L curve, and the run's parameters — the one
 * home for each. When the run has finished markets the numbers are the whole
 * basket's combined total (P&L, trades, win rate across every market); the
 * parameters below stay the same for every market, so they read the same
 * whichever market is selected. Before any market is selected the rows show the
 * editor's own (saved) settings.
 */
export function AutomationBacktestParamsPanel({
  selectedRun,
  combined,
  combinedDrawdownPct,
  potAtMaxDdUsd,
  groupCurve,
  openPositions,
  marketsTotal,
  interval,
  days,
  backtestSettings,
  config,
}: {
  /** The selected market's finished run — the immutable source of truth. */
  selectedRun: BacktestDetail | null
  /** Combined stats across every finished market; null until one finishes. */
  combined: CombinedBacktestSummary | null
  /** The whole pot's peak-to-trough drawdown (all markets blended), ≤ 0. */
  combinedDrawdownPct: number | null
  /** Money in the pot at the drawdown trough, in dollars. */
  potAtMaxDdUsd: number | null
  /** Every market's equity blended into one curve; null until results load. */
  groupCurve: GroupCombinedCurve | null
  /** Money the basket was still holding when its window closed. */
  openPositions: GroupOpenPositions | null
  /** Markets in the run, finished or not, for the "Markets" tile. */
  marketsTotal: number
  interval: AutomationInterval
  /** Setup-form days, shown until a run is selected. */
  days: string
  backtestSettings: AutomationBacktestSettings
  /** Compiled config for strategy rows while nothing is selected. */
  config: AutomationConfig | null
}) {
  const rows = React.useMemo(() => {
    if (selectedRun) {
      const out: { label: string; value: string }[] = [
        { label: "Date range", value: `${windowDaysOf(selectedRun)}d back` },
        { label: "Timeframe", value: selectedRun.interval },
        { label: "Starting equity", value: `$${selectedRun.startingEquity}` },
        { label: "Taker fee", value: `${selectedRun.costs.takerFeeBps} bps` },
        { label: "Maker fee", value: `${selectedRun.costs.makerFeeBps} bps` },
        { label: "Slippage", value: `${selectedRun.costs.slippageBps} bps` },
      ]
      // The editor only ever loads automation runs; the guard is for the type.
      if (!isManualRunParams(selectedRun.params)) {
        out.push(...automationInputRows(selectedRun.params))
      }
      return out
    }
    const out: { label: string; value: string }[] = [
      { label: "Date range", value: `${days || "—"}d back` },
      { label: "Timeframe", value: interval },
      { label: "Starting equity", value: `$${backtestSettings.startingEquity}` },
      { label: "Taker fee", value: `${backtestSettings.takerFeeBps} bps` },
      { label: "Maker fee", value: `${backtestSettings.makerFeeBps} bps` },
      { label: "Slippage", value: `${backtestSettings.slippageBps} bps` },
    ]
    if (config) out.push(...automationInputRows(config))
    return out
  }, [selectedRun, interval, days, backtestSettings, config])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          {combined
            ? "Backtest · all markets"
            : selectedRun
              ? `Backtest · ${selectedRun.market}`
              : "Backtest params"}
        </h2>
        <span className="text-[10px] text-muted-foreground">Read-only</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {combined ? (
          <BacktestGroupKpis
            summary={combined}
            marketsTotal={marketsTotal}
            combinedDrawdownPct={combinedDrawdownPct}
            potAtMaxDdUsd={potAtMaxDdUsd}
            // undefined until the selected market's run has loaded, so the
            // tiles stay quiet instead of announcing "no shared wallet" for the
            // moment between the basket totals arriving and the run behind them.
            wallet={selectedRun ? (selectedRun.result?.portfolio ?? null) : undefined}
            openPositions={openPositions}
            className="p-3"
          />
        ) : (
          <BacktestKpis
            stats={selectedRun?.result?.stats ?? null}
            className="p-3"
          />
        )}
        {combined ? (
          <PnlCurveCard
            points={groupCurve?.points ?? []}
            baseline={groupCurve?.startEquity ?? null}
            emptyMessage="The P&L curve appears once the run's markets finish."
            className="p-3 pt-0"
          />
        ) : null}
        <div className="grid content-start gap-1.5 p-3 pt-0">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-right font-mono text-[11px] tabular-nums">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
