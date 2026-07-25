import { Kpi } from "@/components/kpi"
import type { BacktestStats } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

import type { CombinedBacktestSummary } from "./backtest-combine"
import { num, pct, profitFactor, signedUsd, usd } from "./backtest-format"

/** The one home for a run's headline numbers — summary rail + editor backtest mode. */
export function BacktestKpis({
  stats,
  className,
}: {
  stats: BacktestStats | null
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Kpi
        label="Net P&L"
        value={stats ? pct(stats.netPnlPct) : "—"}
        sub={stats ? signedUsd(stats.netPnl) : ""}
        tone={stats?.netPnl}
      />
      <Kpi
        label="Win Rate"
        value={stats ? `${(stats.all.winRate * 100).toFixed(0)}%` : "—"}
        sub={stats ? `${stats.all.wins}W / ${stats.all.losses}L` : ""}
      />
      <Kpi
        label="Profit Factor"
        value={stats ? profitFactor(stats.all.profitFactor) : "—"}
        sub={stats ? `${stats.all.trades} trades` : ""}
      />
      <Kpi
        label="Max Drawdown"
        value={stats ? `-${stats.maxDrawdownPct.toFixed(2)}%` : "—"}
        sub={stats ? usd(-stats.maxDrawdownUsd) : ""}
        tone={stats ? -1 : undefined}
      />
      <Kpi
        label="Trades"
        value={stats ? String(stats.all.trades) : "—"}
        sub="closed"
      />
      <Kpi
        label="Sharpe"
        value={stats ? num(stats.all.sharpe) : "—"}
        sub="per trade"
      />
    </div>
  )
}

/**
 * The same headline grid, but for a whole run's basket instead of one market:
 * summed P&L and trades, a trade-weighted win rate, the worst single-market
 * drawdown, and how many markets finished green. Shown in the editor's backtest
 * panel so the numbers describe the entire run, not just the selected market.
 */
export function BacktestGroupKpis({
  summary,
  marketsTotal,
  combinedDrawdownPct,
  potAtMaxDdUsd,
  peakWalletPct,
  className,
}: {
  summary: CombinedBacktestSummary
  /** Markets in the run, finished or not, for the "Markets" tile. */
  marketsTotal: number
  /** The whole pot's blended peak-to-trough drawdown (≤ 0); null until loaded. */
  combinedDrawdownPct?: number | null
  /** Money in the pot at the drawdown trough, in dollars; null until loaded. */
  potAtMaxDdUsd?: number | null
  /** The most of the shared wallet ever deployed at once, in percent. */
  peakWalletPct?: number | null
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Kpi
        label="Net P&L"
        value={summary.netPnlPct !== null ? pct(summary.netPnlPct) : "—"}
        sub={signedUsd(summary.netPnl)}
        tone={summary.netPnl}
      />
      <Kpi
        label="Win Rate"
        value={
          summary.winRate !== null
            ? `${(summary.winRate * 100).toFixed(0)}%`
            : "—"
        }
        sub={`${summary.trades} trades`}
      />
      <Kpi
        label="Max Drawdown"
        value={
          combinedDrawdownPct != null
            ? `-${Math.abs(combinedDrawdownPct).toFixed(2)}%`
            : "—"
        }
        sub={
          potAtMaxDdUsd != null ? `${usd(potAtMaxDdUsd)} in pot` : "whole pot"
        }
        tone={combinedDrawdownPct != null ? -1 : undefined}
      />
      <Kpi
        label="Markets"
        value={`${summary.markets}/${marketsTotal}`}
        sub="tested"
      />
      <Kpi
        label="Green"
        value={`${summary.greenMarkets}/${summary.markets}`}
        sub="net positive"
      />
      <Kpi
        label="Peak Wallet"
        value={peakWalletPct != null ? `${peakWalletPct.toFixed(0)}%` : "—"}
        sub="max deployed"
      />
    </div>
  )
}
