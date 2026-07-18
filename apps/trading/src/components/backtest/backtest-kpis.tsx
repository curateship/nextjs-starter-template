import { Kpi } from "@/components/kpi"
import type { BacktestStats } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

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
