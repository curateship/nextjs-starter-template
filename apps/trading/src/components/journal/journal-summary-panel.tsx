import {
  pct,
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/lib/format"
import { PnlCurveCard } from "@/components/backtest/pnl-curve-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { JournalSummary } from "./journal-model"

/**
 * Left rail of the trade journal: what the account actually did — total P&L,
 * the headline counts, and the realised-equity curve. Same anatomy as the
 * backtest group workspace's summary rail, so the two pages read alike.
 */
export function JournalSummaryPanel({
  summary,
  walletLabel,
}: {
  summary: JournalSummary
  walletLabel: string
}) {
  const rows: { label: string; value: string; tone?: number | null }[] = [
    { label: "Markets", value: String(summary.markets) },
    { label: "Trades", value: summary.trades.toLocaleString() },
    {
      label: "Win rate",
      value: summary.winRate !== null ? pct(summary.winRate, 1) : "—",
    },
    {
      label: "Won / lost",
      value: summary.trades > 0 ? `${summary.wins} / ${summary.losses}` : "—",
    },
    {
      label: "Max drawdown",
      value:
        summary.maxDrawdownPct !== null
          ? pct(summary.maxDrawdownPct, 1)
          : "—",
      tone: summary.maxDrawdownPct !== null ? -summary.maxDrawdownPct : null,
    },
    { label: "Fees paid", value: usd(summary.fees) },
  ]

  return (
    <ScrollArea className="h-full">
      <div className="flex min-w-0 flex-col gap-5 p-4">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold">Summary</span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Total P&L</span>
              <span
                className={cn(
                  "font-mono text-2xl leading-none font-semibold tabular-nums",
                  summary.trades > 0
                    ? toneClass(summary.netPnl)
                    : "text-foreground"
                )}
              >
                {summary.trades > 0 ? signedUsd(summary.netPnl) : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {walletLabel}
              </span>
            </div>
            {summary.netPnlPct !== null ? (
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums",
                  summary.netPnlPct >= 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-red-500/10 text-red-500"
                )}
              >
                {summary.netPnlPct >= 0 ? "▲" : "▼"} {signedPct(summary.netPnlPct)}
              </span>
            ) : null}
          </div>
          <div className="h-px bg-border" />
          <div className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="text-sm text-muted-foreground">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    row.tone != null ? toneClass(row.tone) : "text-foreground"
                  )}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <PnlCurveCard
          points={summary.curve}
          emptyMessage={
            summary.trades === 0
              ? "No closed trades yet."
              : "Not enough data to plot the P&L curve"
          }
        />
      </div>
    </ScrollArea>
  )
}
