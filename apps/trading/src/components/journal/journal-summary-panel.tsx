import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  pct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-format"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { JournalSummary } from "./journal-model"

/** Trading polarity pair, consistent with the price + equity charts. */
const CHART_UP = "#089981"
const CHART_DOWN = "#f23645"

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

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
      value: summary.winRate !== null ? `${summary.winRate.toFixed(1)}%` : "—",
    },
    {
      label: "Won / lost",
      value: summary.trades > 0 ? `${summary.wins} / ${summary.losses}` : "—",
    },
    {
      label: "Max drawdown",
      value:
        summary.maxDrawdownPct !== null
          ? `${summary.maxDrawdownPct.toFixed(1)}%`
          : "—",
      tone: summary.maxDrawdownPct !== null ? -summary.maxDrawdownPct : null,
    },
    { label: "Fees paid", value: usd(summary.fees) },
  ]

  const chartData = summary.curve
  const positiveCurve =
    chartData.length > 1
      ? chartData[chartData.length - 1].eq >= chartData[0].eq
      : true
  const rangeLabel =
    summary.firstTradeAt !== null && summary.lastTradeAt !== null
      ? `${compactDateFormatter.format(summary.firstTradeAt)} – ${compactDateFormatter.format(summary.lastTradeAt)}`
      : null

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
                {summary.netPnlPct >= 0 ? "▲" : "▼"} {pct(summary.netPnlPct)}
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

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold">P&L curve</span>
            {rangeLabel ? (
              <span className="text-[11px] text-muted-foreground">
                {rangeLabel}
              </span>
            ) : null}
          </div>
          {chartData.length < 2 ? (
            <div className="flex h-[184px] items-center justify-center rounded-lg border bg-muted/30 px-3 text-center text-xs text-muted-foreground">
              {summary.trades === 0
                ? "No closed trades yet."
                : "Not enough data to plot the P&L curve"}
            </div>
          ) : (
            <ChartContainer
              config={{ eq: { label: "Equity" } }}
              className="aspect-auto h-[184px] w-full min-w-0"
            >
              <AreaChart
                data={chartData}
                margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id="journal-pnl-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={positiveCurve ? CHART_UP : CHART_DOWN}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor={positiveCurve ? CHART_UP : CHART_DOWN}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.3} />
                <XAxis
                  dataKey="t"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(value: number) =>
                    compactDateFormatter.format(value)
                  }
                />
                <YAxis
                  width={54}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) =>
                    `$${Math.round(value).toLocaleString()}`
                  }
                />
                <ReferenceLine
                  y={chartData[0].eq}
                  strokeDasharray="5 4"
                  stroke="currentColor"
                  strokeOpacity={0.4}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        payload?.[0]
                          ? new Date(
                              payload[0].payload.t as number
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : ""
                      }
                    />
                  }
                />
                <Area
                  dataKey="eq"
                  type="monotone"
                  stroke={positiveCurve ? CHART_UP : CHART_DOWN}
                  strokeWidth={2}
                  fill="url(#journal-pnl-fill)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
