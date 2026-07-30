import { Row } from "@/components/kpi"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BacktestResult } from "@/lib/backtest/types"

import { BacktestKpis } from "./backtest-kpis"
import { signedPct, usd } from "@/lib/format"

export function BacktestSummary({ result }: { result: BacktestResult | null }) {
  const stats = result?.stats ?? null

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
        <div className="px-3 pt-3 pb-1 text-xs font-bold">Backtest Summary</div>

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
              Halted ({stats.halt.kind.replace(/_/g, " ")}): {stats.halt.reason}
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
            Candle-granularity simulation — market fills at bar price, limits
            fill on high/low cross. Same risk gating as live.
          </p>
        </div>
      </div>
    </ScrollArea>
  )
}
