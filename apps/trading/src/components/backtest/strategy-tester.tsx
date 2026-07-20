import * as React from "react"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { STICKY_SCROLL_OVERRIDES } from "@/components/ui/table"
import { BOTTOM_PANEL_HEADER } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  BacktestResult,
  BacktestTrade,
  SideStats,
} from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

import { BacktestTradesTable } from "./backtest-trades-table"
import { num, profitFactor, signedUsd, toneClass, usd } from "./backtest-format"

const UP = "#089981"
const DOWN = "#f23645"

export function StrategyTester({
  result,
  startingEquity,
  markPrice,
  selectedTradeN = null,
  onSelectTrade,
}: {
  result: BacktestResult | null
  startingEquity: number
  markPrice: number
  /** Trade number highlighted in the list (chart is zoomed to it). */
  selectedTradeN?: number | null
  /** Row click — null when the selected trade is clicked again. */
  onSelectTrade?: (trade: BacktestTrade | null) => void
}) {
  return (
    <Tabs defaultValue="trades" className="flex h-full min-h-0 flex-col gap-0">
      <div className={BOTTOM_PANEL_HEADER}>
        <TabsList variant="pill">
          {[
            ["trades", "List of Trades"],
            ["overview", "Overview"],
            ["performance", "Performance Summary"],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <ScrollArea className={cn("min-h-0 flex-1", STICKY_SCROLL_OVERRIDES)}>
        <TabsContent value="trades" className="m-0">
          <BacktestTradesTable
            result={result}
            markPrice={markPrice}
            selectedTradeN={selectedTradeN}
            onSelectTrade={onSelectTrade}
          />
        </TabsContent>
        <TabsContent value="overview" className="m-0">
          <Overview result={result} startingEquity={startingEquity} />
        </TabsContent>
        <TabsContent value="performance" className="m-0">
          <PerformanceSummary stats={result?.stats ?? null} />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  )
}

function Overview({
  result,
  startingEquity,
}: {
  result: BacktestResult | null
  startingEquity: number
}) {
  const stats = result?.stats
  const equity = React.useMemo(
    () => downsample(result?.equityCurve ?? [], 700),
    [result]
  )
  const positive = (stats?.netPnl ?? 0) >= 0

  return (
    <div className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground/80">
          Equity Curve
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-block h-0 w-3.5 border-t border-dashed border-muted-foreground" />
          Initial capital
        </span>
      </div>
      {equity.length < 2 ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border bg-muted/30 text-xs text-muted-foreground">
          Not enough data to plot equity
        </div>
      ) : (
        <ChartContainer
          config={{ eq: { label: "Equity" } }}
          className="h-[200px] w-full rounded-lg border bg-muted/30"
        >
          <AreaChart data={equity} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="bt-equity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={positive ? UP : DOWN} stopOpacity={0.25} />
                <stop offset="100%" stopColor={positive ? UP : DOWN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(value: number) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              width={60}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => `$${Math.round(value).toLocaleString()}`}
            />
            <ReferenceLine
              y={startingEquity}
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
                        ).toLocaleString("en-US", { hour12: false })
                      : ""
                  }
                />
              }
            />
            <Area
              dataKey="eq"
              type="monotone"
              stroke={positive ? UP : DOWN}
              strokeWidth={2}
              fill="url(#bt-equity-fill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  )
}

const PERF_ROWS: {
  label: string
  get: (side: SideStats) => string
  tone?: (side: SideStats) => number
}[] = [
  { label: "Net Profit", get: (s) => signedUsd(s.netPnl), tone: (s) => s.netPnl },
  { label: "Gross Profit", get: (s) => usd(s.grossProfit) },
  { label: "Gross Loss", get: (s) => usd(s.grossLoss) },
  { label: "Total Trades", get: (s) => String(s.trades) },
  { label: "Winning Trades", get: (s) => String(s.wins) },
  { label: "Losing Trades", get: (s) => String(s.losses) },
  { label: "Percent Profitable", get: (s) => `${(s.winRate * 100).toFixed(1)}%` },
  { label: "Profit Factor", get: (s) => profitFactor(s.profitFactor) },
  { label: "Avg Trade", get: (s) => signedUsd(s.avgTrade), tone: (s) => s.avgTrade },
  { label: "Avg Win", get: (s) => usd(s.avgWin) },
  { label: "Avg Loss", get: (s) => usd(s.avgLoss) },
  { label: "Largest Win", get: (s) => usd(s.largestWin) },
  { label: "Largest Loss", get: (s) => usd(s.largestLoss) },
  { label: "Sharpe (per trade)", get: (s) => num(s.sharpe) },
]

function PerformanceSummary({ stats }: { stats: BacktestResult["stats"] | null }) {
  if (!stats) {
    return <Empty text="Run a backtest to see the performance summary." />
  }
  return (
    <div className="py-1">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-2 text-[10px] font-medium text-muted-foreground">
        <span>Metric</span>
        <span className="text-right">All</span>
        <span className="text-right">Long</span>
        <span className="text-right">Short</span>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] border-t px-4 py-1.5 text-[11px]">
        <span className="font-medium text-foreground/80">Max Drawdown</span>
        <span className="text-right font-mono text-red-500">
          {usd(-stats.maxDrawdownUsd)}
        </span>
        <span className="text-right font-mono text-muted-foreground">—</span>
        <span className="text-right font-mono text-muted-foreground">—</span>
      </div>
      {PERF_ROWS.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[2fr_1fr_1fr_1fr] border-t px-4 py-1.5 text-[11px]"
        >
          <span className="font-medium text-foreground/80">{row.label}</span>
          <PerfCell value={row.get(stats.all)} tone={row.tone?.(stats.all)} />
          <PerfCell value={row.get(stats.long)} tone={row.tone?.(stats.long)} />
          <PerfCell value={row.get(stats.short)} tone={row.tone?.(stats.short)} />
        </div>
      ))}
    </div>
  )
}

function PerfCell({ value, tone }: { value: string; tone?: number }) {
  return (
    <span
      className={cn(
        "text-right font-mono",
        tone !== undefined ? toneClass(tone) : "text-foreground/80"
      )}
    >
      {value}
    </span>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

/** Strides an array down to at most `max` points, keeping the last. */
function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points
  const stride = Math.ceil(points.length / max)
  const out: T[] = []
  for (let i = 0; i < points.length; i += stride) out.push(points[i])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}
