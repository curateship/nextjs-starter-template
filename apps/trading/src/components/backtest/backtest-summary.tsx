import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BacktestResult } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

import {
  num,
  pct,
  price as fmtPrice,
  profitFactor,
  signedUsd,
  toneClass,
  usd,
} from "./backtest-format"

export type SummaryConfig = {
  market: string
  interval: string
  windowDays: number
  startingEquity: number
  /** Configured fee/slippage assumptions, e.g. "taker 4.5bp · slip 2bp". */
  costsText: string
  network: string
  ranAt: string | null
}

export function BacktestSummary({
  result,
  config,
  markPrice,
}: {
  result: BacktestResult | null
  config: SummaryConfig
  markPrice: number
}) {
  const stats = result?.stats
  const open = result?.openPosition ?? null
  const uPnl =
    open && markPrice > 0 ? (markPrice - open.entryPx) * open.szi : 0

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
      <div className="px-3 pt-3 pb-1 text-xs font-bold">Backtest Summary</div>

      <div className="grid grid-cols-2 gap-2 p-3 pt-2">
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

      <div className="flex flex-col gap-2 p-3">
        <span className="text-[11px] font-semibold text-foreground/80">
          Current Position
        </span>
        {open ? (
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    open.side === "long" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {open.side === "long" ? "Long" : "Short"}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {num(Math.abs(open.szi), 4)} {config.market}
                </span>
              </div>
              <Row label="Entry" value={fmtPrice(open.entryPx)} />
              <Row label="Mark" value={markPrice > 0 ? fmtPrice(markPrice) : "—"} />
              <Row label="Unreal. P&L" value={`${signedUsd(uPnl)}`} tone={uPnl} />
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">
            {result ? "Flat — no open position" : "Run a backtest to see results"}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <span className="text-[11px] font-semibold text-foreground/80">Properties</span>
        <Row label="Market" value={config.market} />
        <Row label="Timeframe" value={config.interval} />
        <Row label="Window" value={`${config.windowDays}d`} />
        <Row label="Starting amount" value={usd(config.startingEquity)} />
        <Row
          label="Buy & Hold"
          value={stats ? pct(stats.buyHoldPct) : "—"}
          tone={stats?.buyHoldPct}
        />
        <Row label="Costs" value={config.costsText} />
        <Row label="Fees paid" value={stats ? usd(stats.fees) : "—"} />
        <Row label="Network" value={config.network} />
        {config.ranAt ? <Row label="Ran at" value={config.ranAt} /> : null}
        {stats?.halt.kind ? (
          <div className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            Halted ({stats.halt.kind.replace(/_/g, " ")}): {stats.halt.reason}
          </div>
        ) : null}
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Candle-granularity simulation — market fills at bar price, limits fill
          on high/low cross. Same risk gating as live.
        </p>
      </div>
      </div>
    </ScrollArea>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: number
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-base font-semibold",
            tone !== undefined ? toneClass(tone) : undefined
          )}
        >
          {value}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: number
}) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono",
          tone !== undefined ? toneClass(tone) : "text-foreground/80"
        )}
      >
        {value}
      </span>
    </div>
  )
}

