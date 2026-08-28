import { useState } from "react"
import { endOfDay, startOfDay, subMonths, subWeeks } from "date-fns"
import { ChartNoAxesCombinedIcon, InfoIcon } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { TradeBadge } from "@/components/trade/trade-badge"
import {
  DashboardCardHeader,
  DashboardCardHeaderIcon,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { DatePicker } from "@/components/ui/date-picker"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableSortButton } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import type {
  TradingOverview,
  TradingOverviewPoint,
  TradingOverviewWallet,
} from "@/lib/trade/dashboard/overview"
import {
  filterTradingOverviewProfitSeries,
  mergeTradingOverviewProfitSeries,
  type TradingOverviewProfitChartPoint,
} from "@/lib/trade/dashboard/profit-series"
import { formatChange, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { walletProfitWindowLabel } from "@/lib/trade/wallets"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

const WALLET_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const RANGE_PRESETS = ["1w", "1m", "3m", "6m", "all"] as const
type RangePreset = (typeof RANGE_PRESETS)[number]
type ProfitRange = {
  preset: RangePreset | "custom"
  from: number | null
  to: number | null
}

const RANGE_LABELS: Record<RangePreset, string> = {
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  all: "All",
}

const WALLET_SORTS = [
  "wallet-asc",
  "wallet-desc",
  "result-asc",
  "result-desc",
] as const
type WalletSort = (typeof WALLET_SORTS)[number]
type WalletSortKey = "wallet" | "result"
const WALLET_SORT_STORAGE_KEY = "trade-overview-wallet-sort"

type AnsweredWallet = TradingOverviewWallet & {
  summary: Extract<TradingOverviewWallet["summary"], { state: "ok" }>
  performance: NonNullable<TradingOverviewWallet["performance"]>
  profit: NonNullable<TradingOverviewWallet["profit"]>
}

type ProfitSeries = {
  key: string
  walletId: string | null
  label: string
  color: string
  points: TradingOverviewPoint[]
}

function startedLabel() {
  return walletProfitWindowLabel(new Date())
}

function answeredWallets(overview: TradingOverview): AnsweredWallet[] {
  return overview.wallets.filter(
    (wallet): wallet is AnsweredWallet =>
      wallet.summary.state === "ok" &&
      wallet.performance !== null &&
      wallet.profit !== null
  )
}

function visibleWallets(overview: TradingOverview) {
  return overview.wallets.filter(
    (wallet) => wallet.summary.state !== "inactive"
  )
}

function profitSeries(overview: TradingOverview): ProfitSeries[] {
  return [
    {
      key: "total",
      walletId: null,
      label: "All wallets",
      color: "var(--foreground)",
      points: overview.profit,
    },
    ...visibleWallets(overview).flatMap((wallet, index) => {
      if (
        wallet.summary.state !== "ok" ||
        !wallet.performance ||
        !wallet.profit
      ) {
        return []
      }
      return [
        {
          key: `wallet${index}`,
          walletId: wallet.id,
          label: wallet.label,
          color: WALLET_COLORS[index % WALLET_COLORS.length],
          points: wallet.profit,
        },
      ]
    }),
  ]
}

function profitRangeDates(
  data: readonly TradingOverviewProfitChartPoint[],
  range: ProfitRange
) {
  const firstAt = data[0]?.at
  const lastAt = data.at(-1)?.at
  if (range.preset === "custom") {
    return {
      from: range.from ?? firstAt,
      to: range.to ?? lastAt,
    }
  }
  const presetFrom =
    lastAt === undefined
      ? undefined
      : range.preset === "1w"
        ? startOfDay(subWeeks(new Date(lastAt), 1)).getTime()
        : range.preset === "1m"
          ? startOfDay(subMonths(new Date(lastAt), 1)).getTime()
          : range.preset === "3m"
            ? startOfDay(subMonths(new Date(lastAt), 3)).getTime()
            : range.preset === "6m"
              ? startOfDay(subMonths(new Date(lastAt), 6)).getTime()
              : firstAt

  return {
    from:
      firstAt === undefined || lastAt === undefined
        ? undefined
        : Math.max(firstAt, presetFrom ?? firstAt),
    to: firstAt === undefined || lastAt === undefined ? undefined : lastAt,
  }
}

export function PnlGraphWidget({
  overview,
  className,
}: {
  overview: TradingOverview
  className: string
}) {
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [range, setRange] = useState<ProfitRange>({
    preset: "all",
    from: null,
    to: null,
  })
  const answered = answeredWallets(overview)
  const sum = (pick: (wallet: AnsweredWallet) => number) =>
    answered.reduce((total, wallet) => total + pick(wallet), 0)
  const balance = sum((wallet) => wallet.summary.equity)
  const madeOrLost = sum((wallet) => wallet.performance.madeOrLost)
  const settled = sum((wallet) => wallet.performance.settled)
  const open = sum((wallet) => wallet.performance.open)
  const fees = sum((wallet) => wallet.performance.fees)
  const profitShare = balance > 0 ? madeOrLost / balance : null
  const selectedWallet = answered.find(
    (wallet) => wallet.id === selectedWalletId
  )
  const activeSelectedWalletId = selectedWallet?.id ?? null
  const series = profitSeries(overview)
  const data = mergeTradingOverviewProfitSeries(series)
  const rangeDates = profitRangeDates(data, range)
  const chartConfig = Object.fromEntries(
    series.map((one) => [one.key, { label: one.label, color: one.color }])
  ) satisfies ChartConfig
  const missing = overview.wallets.filter(
    (wallet) => wallet.summary.state === "unreachable"
  ).length

  return (
    <Card className={cn("min-h-0 gap-0 py-0", className)}>
      <DashboardCardHeader className="flex-wrap">
        <div className="flex min-w-0 items-center gap-2">
          <DashboardCardHeaderIcon>
            <ChartNoAxesCombinedIcon className="size-4" />
          </DashboardCardHeaderIcon>
          <h2 className={cn("truncate", dashboardCardHeadingClassName)}>
            PnL Graph
          </h2>
          <div
            aria-label="Current made or lost"
            className="flex items-center gap-1.5"
          >
            <p
              className={cn(
                "font-mono text-xl leading-none font-semibold tracking-tight tabular-nums",
                moneyTone(madeOrLost)
              )}
            >
              {formatSignedUsd(madeOrLost)}
            </p>
            {profitShare === null ? null : (
              <TradeBadge
                tone={
                  madeOrLost > 0 ? "made" : madeOrLost < 0 ? "lost" : "neutral"
                }
                className="font-mono text-xl leading-none font-semibold tracking-tight tabular-nums"
              >
                {formatChange(profitShare)}
              </TradeBadge>
            )}
          </div>
          {missing ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About missing wallet figures"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {overview.missingVenues.join(" and ")} did not answer. The total
                includes only the wallets that answered.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <ProfitRangeControls
          data={data}
          range={range}
          dates={rangeDates}
          onRange={setRange}
        />
      </DashboardCardHeader>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(18rem,32%)_1fr] lg:divide-x">
        <WalletList
          overview={overview}
          answered={answered}
          selectedWalletId={activeSelectedWalletId}
          onSelectWallet={setSelectedWalletId}
        />
        <ProfitChart
          overview={overview}
          series={series}
          data={data}
          config={chartConfig}
          selectedWalletId={activeSelectedWalletId}
          rangeDates={rangeDates}
          balance={balance}
          settled={settled}
          open={open}
          fees={fees}
        />
      </div>
    </Card>
  )
}

function ProfitRangeControls({
  data,
  range,
  dates,
  onRange,
}: {
  data: TradingOverviewProfitChartPoint[]
  range: ProfitRange
  dates: ReturnType<typeof profitRangeDates>
  onRange: (range: ProfitRange) => void
}) {
  const choosePreset = (preset: RangePreset) =>
    onRange({ preset, from: null, to: null })
  const chooseFrom = (date: Date | undefined) => {
    if (!date || dates.to === undefined) return
    const nextFrom = startOfDay(date).getTime()
    onRange({
      preset: "custom",
      from: nextFrom,
      to: nextFrom > dates.to ? endOfDay(date).getTime() : dates.to,
    })
  }
  const chooseTo = (date: Date | undefined) => {
    if (!date || dates.from === undefined) return
    const nextTo = endOfDay(date).getTime()
    onRange({
      preset: "custom",
      from: nextTo < dates.from ? startOfDay(date).getTime() : dates.from,
      to: nextTo,
    })
  }

  return (
    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
      <Tabs
        value={range.preset}
        onValueChange={(value) => choosePreset(value as RangePreset)}
      >
        <TabsList className="h-8" aria-label="Profit date range">
          {RANGE_PRESETS.map((preset) => (
            <TabsTrigger key={preset} value={preset} className="px-2 text-xs">
              {RANGE_LABELS[preset]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <span className="sr-only">
        <label htmlFor="pnl-from-date">From date</label>
      </span>
      <DatePicker
        id="pnl-from-date"
        value={dates.from === undefined ? undefined : new Date(dates.from)}
        onChange={chooseFrom}
        disabled={data.length === 0}
        placeholder="From"
        className="h-8 w-auto text-xs"
      />
      <span className="sr-only">
        <label htmlFor="pnl-to-date">To date</label>
      </span>
      <DatePicker
        id="pnl-to-date"
        value={dates.to === undefined ? undefined : new Date(dates.to)}
        onChange={chooseTo}
        disabled={data.length === 0}
        placeholder="To"
        className="h-8 w-auto text-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => choosePreset("all")}
      >
        Reset
      </Button>
    </div>
  )
}

function WalletList({
  overview,
  answered,
  selectedWalletId,
  onSelectWallet,
}: {
  overview: TradingOverview
  answered: AnsweredWallet[]
  selectedWalletId: string | null
  onSelectWallet: (walletId: string | null) => void
}) {
  const [sort, rememberSort] = useRememberedChoice<WalletSort>(
    WALLET_SORT_STORAGE_KEY,
    "result-desc",
    WALLET_SORTS
  )
  const [sortKey, sortDirection] = sort.split("-") as [
    WalletSortKey,
    "asc" | "desc",
  ]
  const balance = answered.reduce(
    (total, wallet) => total + wallet.summary.equity,
    0
  )
  const madeOrLost = answered.reduce(
    (total, wallet) => total + wallet.performance.madeOrLost,
    0
  )
  const missing = overview.wallets.filter(
    (wallet) => wallet.summary.state === "unreachable"
  ).length
  const wallets = visibleWallets(overview)
  const orderedWallets = [...wallets].sort((left, right) => {
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortKey === "wallet") {
      return left.label.localeCompare(right.label) * direction
    }
    const leftResult = left.performance?.madeOrLost
    const rightResult = right.performance?.madeOrLost
    if (leftResult === undefined) return rightResult === undefined ? 0 : 1
    if (rightResult === undefined) return -1
    return (leftResult - rightResult) * direction
  })
  const toggleSort = (key: WalletSortKey) => {
    const direction =
      sortKey === key
        ? sortDirection === "asc"
          ? "desc"
          : "asc"
        : key === "wallet"
          ? "asc"
          : "desc"
    rememberSort(`${key}-${direction}`)
  }

  return (
    <section
      aria-label="Wallets"
      className="flex min-h-0 flex-col border-b lg:border-b-0"
    >
      <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-3 border-b bg-muted/50 px-5 text-xs font-medium text-muted-foreground">
        <TableSortButton
          active={sortKey === "wallet"}
          direction={sortDirection}
          aria-label={`Sort wallets by wallet ${sortKey === "wallet" && sortDirection === "asc" ? "descending" : "ascending"}`}
          onClick={() => toggleSort("wallet")}
        >
          Wallets
        </TableSortButton>
        <TableSortButton
          active={sortKey === "result"}
          direction={sortDirection}
          className="justify-self-end"
          aria-label={`Sort wallets by made or lost ${sortKey === "result" && sortDirection === "desc" ? "ascending" : "descending"}`}
          onClick={() => toggleSort("result")}
        >
          Made or lost
        </TableSortButton>
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="max-h-72 lg:h-full lg:max-h-none"
      >
        <WalletResultRow
          label="All wallets"
          detail={`${answered.length.toLocaleString()} connected${missing ? ` · ${missing.toLocaleString()} missing` : ""}`}
          balance={balance}
          madeOrLost={madeOrLost}
          profit={overview.profit}
          color="var(--foreground)"
          strong
          selected={selectedWalletId === null}
          onSelect={() => onSelectWallet(null)}
        />
        {orderedWallets.map((wallet) => {
          const colorIndex = wallets.findIndex((one) => one.id === wallet.id)
          if (
            wallet.summary.state !== "ok" ||
            !wallet.performance ||
            !wallet.profit
          ) {
            return <UnavailableWalletRow key={wallet.id} wallet={wallet} />
          }
          return (
            <WalletResultRow
              key={wallet.id}
              label={wallet.label}
              detail={wallet.venue}
              balance={wallet.summary.equity}
              madeOrLost={wallet.performance.madeOrLost}
              profit={wallet.profit}
              color={WALLET_COLORS[colorIndex % WALLET_COLORS.length]}
              selected={selectedWalletId === wallet.id}
              onSelect={() => onSelectWallet(wallet.id)}
            />
          )
        })}
      </ScrollArea>
    </section>
  )
}

function WalletResultRow({
  label,
  detail,
  balance,
  madeOrLost,
  profit,
  color,
  strong = false,
  selected,
  onSelect,
}: {
  label: string
  detail: string
  balance: number
  madeOrLost: number
  profit: TradingOverviewPoint[]
  color: string
  strong?: boolean
  selected: boolean
  onSelect: () => void
}) {
  const chartData = profit.map((point) => ({
    at: point.at,
    money: point.money,
  }))

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "block w-full cursor-pointer border-r-2 border-b px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        selected ? "border-r-muted-foreground/60" : "border-r-transparent"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <p
            className={cn(
              "truncate",
              strong || selected ? "font-semibold" : "font-medium"
            )}
          >
            {label}
          </p>
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        </div>
        <span className="font-mono font-medium tabular-nums">
          {formatUsd(balance)}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="h-8 min-w-0">
          {chartData.length ? (
            <ChartContainer
              config={{ money: { label, color } }}
              className="h-full w-full"
              aria-label={`${label} profit over time`}
            >
              <LineChart
                data={chartData}
                margin={{ top: 3, right: 1, bottom: 3, left: 1 }}
              >
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(_, payload) => {
                        const at = payload?.[0]?.payload?.at
                        return typeof at === "number"
                          ? new Date(at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : ""
                      }}
                      formatter={(value) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatSignedUsd(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Line
                  type="stepAfter"
                  dataKey="money"
                  isAnimationActive={false}
                  stroke="var(--color-money)"
                  strokeWidth={1.25}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "var(--color-money)",
                    stroke: "var(--background)",
                    strokeWidth: 3,
                  }}
                />
              </LineChart>
            </ChartContainer>
          ) : null}
        </div>
        <span
          className={cn(
            "font-mono text-base font-semibold tabular-nums",
            moneyTone(madeOrLost)
          )}
        >
          {formatSignedUsd(madeOrLost)}
        </span>
      </div>
    </button>
  )
}

function UnavailableWalletRow({ wallet }: { wallet: TradingOverviewWallet }) {
  return (
    <div className="border-b px-5 py-4 text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-sm bg-muted"
          aria-hidden="true"
        />
        <span className="truncate font-medium text-foreground opacity-60">
          {wallet.label}
        </span>
        <span className="truncate text-xs">{wallet.venue}</span>
      </div>
      <p className="mt-2 text-xs">{wallet.venue} did not answer</p>
    </div>
  )
}

function ProfitChart({
  overview,
  series,
  data,
  config,
  selectedWalletId,
  rangeDates,
  balance,
  settled,
  open,
  fees,
}: {
  overview: TradingOverview
  series: ProfitSeries[]
  data: TradingOverviewProfitChartPoint[]
  config: ChartConfig
  selectedWalletId: string | null
  rangeDates: ReturnType<typeof profitRangeDates>
  balance: number
  settled: number
  open: number
  fees: number
}) {
  const shownData =
    rangeDates.from === undefined || rangeDates.to === undefined
      ? []
      : filterTradingOverviewProfitSeries(data, rangeDates.from, rangeDates.to)

  return (
    <section
      aria-label={`${startedLabel()} profit history`}
      className="flex min-h-72 min-w-0 flex-col px-5 py-4"
    >
      <div className="-mx-5 -mt-4 mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-5 py-2">
        <p className="text-xs font-medium text-muted-foreground">
          {startedLabel()}
          <span aria-hidden="true"> · </span>
          <span title={formatDateTime(new Date(overview.readAt))}>
            last read {formatTimeAgo(new Date(overview.readAt)).toLowerCase()}
          </span>
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <p className="text-right">
            balance{" "}
            <span className="text-foreground">{formatUsd(balance)}</span>
            <span aria-hidden="true"> · </span>
            settled{" "}
            <span className={moneyTone(settled)}>
              {formatSignedUsd(settled)}
            </span>
            <span aria-hidden="true"> · </span>
            open{" "}
            <span className={moneyTone(open)}>{formatSignedUsd(open)}</span>
            <span aria-hidden="true"> · </span>
            fees <span className="text-foreground">{formatUsd(fees)}</span>
          </p>
          {overview.unpricedFills ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <InfoIcon className="size-3.5" />
                  {overview.unpricedFills.toLocaleString()} unpriced
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                The line is short of {overview.unpricedFills.toLocaleString()}{" "}
                {overview.unpricedFills === 1 ? "trade" : "trades"} whose money
                the exchange did not state.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {shownData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {data.length === 0
            ? "No real trades have been recorded yet."
            : "No recorded results fall inside these dates."}
        </div>
      ) : (
        <ChartContainer config={config} className="min-h-64 w-full flex-1">
          <AreaChart
            data={shownData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="pnl-graph-total-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-total)"
                  stopOpacity={0.14}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-total)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="at"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(value) => formatUsd(Number(value))}
              tickLine={false}
              axisLine={false}
              width={66}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const at = payload?.[0]?.payload?.at
                    return typeof at === "number"
                      ? new Date(at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""
                  }}
                  formatter={(value, name, item) => (
                    <div className="flex w-full items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="flex-1 text-muted-foreground">
                        {config[String(name)]?.label ?? String(name)}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatSignedUsd(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="stepAfter"
              dataKey="total"
              isAnimationActive={false}
              stroke="var(--color-total)"
              strokeWidth={2}
              strokeOpacity={selectedWalletId === null ? 1 : 0.22}
              fill="url(#pnl-graph-total-fill)"
              fillOpacity={selectedWalletId === null ? 1 : 0.2}
            />
            {series.slice(1).map((one) => (
              <Line
                key={one.key}
                type="stepAfter"
                dataKey={one.key}
                isAnimationActive={false}
                stroke={`var(--color-${one.key})`}
                strokeWidth={selectedWalletId === one.walletId ? 2 : 1}
                strokeOpacity={
                  selectedWalletId === null
                    ? 0.55
                    : selectedWalletId === one.walletId
                      ? 1
                      : 0.18
                }
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  )
}
