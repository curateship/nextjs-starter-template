import * as React from "react"

import { Row } from "@/components/kpi"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  loadBacktestGroupSummary,
  pollBacktestProgress,
  type BacktestDetail,
  type BacktestGroupRun,
} from "@/lib/api/backtests"
import type {
  BacktestResult,
  GroupCombinedCurve,
  GroupOpenPositions,
} from "@/lib/backtest/types"
import { isManualRunParams } from "@/lib/backtest/manual-types"

import { BacktestGroupKpis, BacktestKpis } from "./backtest-kpis"
import {
  combineMarketStats,
  potAtDrawdown,
  type CombinedBacktestSummary,
} from "./backtest-combine"
import { PnlCurveCard } from "./pnl-curve-card"
import { signedPct, usd } from "@/lib/format"

/** The whole group's numbers, fetched once per loaded group. */
type GroupSummaryState = {
  groupId: string
  combined: CombinedBacktestSummary | null
  combinedDrawdownPct: number | null
  potAtMaxDdUsd: number | null
  curve: GroupCombinedCurve | null
  openPositions: GroupOpenPositions | null
}

/**
 * The saved-run workspace's summary rail. For an automation run it shows the
 * SAME card as the editor's live backtest panel — `BacktestGroupKpis` over the
 * whole basket plus the blended P&L curve — so a saved run and a just-finished
 * run read identically. Manual practice runs (and runs still loading) keep the
 * single-market KPI grid.
 */
export function BacktestSummary({
  result,
  run,
  groupRuns,
}: {
  result: BacktestResult | null
  run: BacktestDetail | null
  groupRuns: BacktestGroupRun[]
}) {
  const stats = result?.stats ?? null
  const groupMode = Boolean(run && !isManualRunParams(run.params))
  const doneIds = React.useMemo(
    () =>
      groupRuns
        .filter((sibling) => sibling.status === "done")
        .map((sibling) => sibling.id),
    [groupRuns]
  )
  const [group, setGroup] = React.useState<GroupSummaryState | null>(null)

  const groupId = run?.groupId ?? null
  const startingEquity = run?.startingEquity ?? 0
  React.useEffect(() => {
    if (!groupMode || !groupId || doneIds.length === 0) return
    let cancelled = false
    void Promise.all([
      pollBacktestProgress(doneIds),
      loadBacktestGroupSummary(groupId),
    ])
      .then(([items, summary]) => {
        if (cancelled) return
        const combined = combineMarketStats(
          items.map((item) => ({
            netPnl: item.netPnl,
            tradeCount: item.tradeCount,
            winRate: item.winRate,
          })),
          { startingEquity }
        )
        const metrics = summary.groupMetrics[groupId]
        const potAtMaxDdUsd = potAtDrawdown(
          summary.groupCurve?.points ?? [],
          metrics?.drawdownAt ?? null
        )
        setGroup({
          groupId,
          combined,
          combinedDrawdownPct: metrics?.combinedDrawdownPct ?? null,
          potAtMaxDdUsd,
          curve: summary.groupCurve,
          openPositions: summary.groupOpenPositions,
        })
      })
      .catch(() => {
        // Transient — the rail falls back to the single-market grid.
      })
    return () => {
      cancelled = true
    }
  }, [groupMode, groupId, doneIds, startingEquity])

  const showGroup = Boolean(
    groupMode && run && group && group.groupId === run.groupId && group.combined
  )

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
        <div className="flex min-h-10 shrink-0 items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wide uppercase">
            {showGroup
              ? "Backtest · all markets"
              : run
                ? `Backtest · ${run.market}`
                : "Backtest summary"}
          </h2>
          <span className="text-[10px] text-muted-foreground">Read-only</span>
        </div>

        {showGroup && group?.combined && run ? (
          <>
            <BacktestGroupKpis
              summary={group.combined}
              marketsTotal={groupRuns.length}
              combinedDrawdownPct={group.combinedDrawdownPct}
              potAtMaxDdUsd={group.potAtMaxDdUsd}
              wallet={run.result?.portfolio ?? null}
              openPositions={group.openPositions}
              className="p-3"
            />
            <PnlCurveCard
              points={group.curve?.points ?? []}
              baseline={group.curve?.startEquity ?? null}
              emptyMessage="The P&L curve appears once the run's markets finish."
              className="p-3 pt-0"
            />
          </>
        ) : (
          <>
            <BacktestKpis stats={stats} className="p-3 pt-2" />

            <div className="flex flex-col gap-2 p-3 pt-1">
              <Row
                label="Buy & Hold"
                value={stats ? signedPct(stats.buyHoldPct) : "—"}
                tone={stats?.buyHoldPct}
              />
              <Row label="Fees paid" value={stats ? usd(stats.fees) : "—"} />
              {stats?.halt.kind ? (
                <div className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                  Halted ({stats.halt.kind.replace(/_/g, " ")}):{" "}
                  {stats.halt.reason}
                </div>
              ) : null}
              {stats?.warnings?.map((warning) => (
                <div
                  key={warning}
                  className="mt-1 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-700 dark:text-red-400"
                >
                  ⚠ {warning}
                </div>
              ))}
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                Candle-granularity simulation — market fills at bar price,
                limits fill on high/low cross. Same risk gating as live.
              </p>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}
