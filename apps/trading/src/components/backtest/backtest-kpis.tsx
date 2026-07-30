import { Kpi } from "@/components/kpi"
import type {
  BacktestPortfolioUsage,
  BacktestStats,
  GroupOpenPositions,
} from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

import type { CombinedBacktestSummary } from "./backtest-combine"
import {
  formatFocusDays,
  num,
  signedPct,
  profitFactor,
  signedUsd,
  usd,
  usdWhole,
} from "@/lib/format"

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
        value={stats ? signedPct(stats.netPnlPct) : "—"}
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
 * Why the wallet tiles are blank on most runs: only a DCA basket makes its
 * markets take turns on one pot. Everything else gives each market its own
 * account, so there is no single wallet to measure.
 */
const NO_SHARED_WALLET = "no shared wallet"

/**
 * Sub-line for a figure a run is too old to carry — the engine was not
 * measuring it yet when the run finished, and results are never rewritten after
 * the fact. Left empty on purpose: the caption's job is to say what the number
 * above it means, so with no number there is nothing for it to say.
 */
const NOT_MEASURED = ""

/** "2 markets open" / "1 market open" — a plain-English count for a sub-line. */
function marketsOpenLabel(count: number) {
  return `${count} market${count === 1 ? "" : "s"} open`
}

/**
 * How long the wallet stayed up at its high-water mark, as real time rather
 * than a share of the run — "held 6d" answers the question on its own, where a
 * percentage sends the reader off to find how long the run was. Zero means the
 * peak did not survive to a single bar's close, which is worth saying outright.
 */
function heldPeakLabel(milliseconds: number) {
  if (milliseconds <= 0) return "under one candle"
  return `held ${formatFocusDays(milliseconds / 86_400_000)}`
}

/**
 * The same headline grid, but for a whole run's basket instead of one market:
 * summed P&L and trades, a trade-weighted win rate, the worst single-market
 * drawdown, and how many markets finished green. Shown in the editor's backtest
 * panel so the numbers describe the entire run, not just the selected market.
 *
 * The last three tiles describe the money rather than the trades: how hard the
 * one shared pot was worked at its heaviest and how long it stayed there, what
 * it typically ran at, and what was still open when the window closed.
 */
export function BacktestGroupKpis({
  summary,
  marketsTotal,
  combinedDrawdownPct,
  potAtMaxDdUsd,
  wallet,
  openPositions,
  className,
}: {
  summary: CombinedBacktestSummary
  /** Markets in the run, finished or not, for the "Markets" tile. */
  marketsTotal: number
  /** The whole pot's blended peak-to-trough drawdown (≤ 0); null until loaded. */
  combinedDrawdownPct?: number | null
  /** Money in the pot at the drawdown trough, in dollars; null until loaded. */
  potAtMaxDdUsd?: number | null
  /**
   * The run's shared-wallet measurements. `null` means the run is loaded and
   * has no shared wallet — only a DCA basket does. `undefined` means it has not
   * loaded yet, which must stay a separate state: saying "no shared wallet"
   * about a run nobody has read is a claim, not a blank.
   */
  wallet?: BacktestPortfolioUsage | null
  /** Money still open across the basket when the window closed. */
  openPositions?: GroupOpenPositions | null
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Kpi
        label="Net P&L"
        value={summary.netPnlPct !== null ? signedPct(summary.netPnlPct) : "—"}
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
        value={
          wallet?.peakExposurePct != null
            ? `${wallet.peakExposurePct.toFixed(0)}%`
            : "—"
        }
        sub={
          wallet === undefined
            ? NOT_MEASURED
            : !wallet
              ? NO_SHARED_WALLET
              : wallet.timeAtPeakMs != null
                ? heldPeakLabel(wallet.timeAtPeakMs)
                : NOT_MEASURED
        }
      />
      <Kpi
        label="Avg Wallet"
        value={
          wallet?.avgExposurePct != null
            ? `${wallet.avgExposurePct.toFixed(0)}%`
            : "—"
        }
        sub={
          wallet === undefined
            ? NOT_MEASURED
            : !wallet
              ? NO_SHARED_WALLET
              : wallet.avgExposurePct != null
                ? "typically in use"
                : NOT_MEASURED
        }
      />
      <Kpi
        label="In Markets"
        value={openPositions ? usdWhole(openPositions.usd) : "—"}
        sub={
          !openPositions
            ? NOT_MEASURED
            : openPositions.markets > 0
              ? marketsOpenLabel(openPositions.markets)
              : "everything closed"
        }
      />
    </div>
  )
}
