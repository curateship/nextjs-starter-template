import { useState, type ReactNode } from "react"
import {
  endOfDay,
  format,
  isSameDay,
  isSameYear,
  startOfDay,
  subMonths,
  subWeeks,
} from "date-fns"
import { CalendarIcon, InfoIcon } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { TradeBadge } from "@/components/trade/trade-badge"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { DatePicker } from "@/components/ui/date-picker"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableSortButton } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { PnlAmount } from "@/components/trade/pnl-amount"
import { formatChange, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

const RANGE_PRESETS = ["1d", "1w", "1m", "3m", "6m", "all"] as const
type RangePreset = (typeof RANGE_PRESETS)[number]
type ProfitRange = {
  preset: RangePreset | "custom"
  from: number | null
  to: number | null
}

const RANGE_LABELS: Record<RangePreset, string> = {
  "1d": "1D",
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
  points: TradingOverviewPoint[]
}

/** The five figures the card names for whichever row is selected. */
type Figures = {
  balance: number
  madeOrLost: number
  settled: number
  open: number
  fees: number
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

/**
 * A wallet that holds nothing and has made nothing: every figure on its row
 * would read $0.00. It folds under "Show empty wallets" so the list starts
 * with the wallets that are doing something.
 */
function isEmptyWallet(wallet: TradingOverviewWallet) {
  return (
    wallet.summary.state === "ok" &&
    wallet.performance !== null &&
    Math.abs(wallet.summary.equity) < 0.005 &&
    Math.abs(wallet.performance.madeOrLost) < 0.005
  )
}

function walletFigures(wallet: AnsweredWallet): Figures {
  return {
    balance: wallet.summary.equity,
    madeOrLost: wallet.performance.madeOrLost,
    settled: wallet.performance.settled,
    open: wallet.performance.open,
    fees: wallet.performance.fees,
  }
}

function totalFigures(wallets: AnsweredWallet[]): Figures {
  const sum = (pick: (figures: Figures) => number) =>
    wallets.reduce((total, wallet) => total + pick(walletFigures(wallet)), 0)
  return {
    balance: sum((figures) => figures.balance),
    madeOrLost: sum((figures) => figures.madeOrLost),
    settled: sum((figures) => figures.settled),
    open: sum((figures) => figures.open),
    fees: sum((figures) => figures.fees),
  }
}

function profitSeries(overview: TradingOverview): ProfitSeries[] {
  return [
    {
      key: "total",
      walletId: null,
      label: "All wallets",
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
  if (range.preset === "1d") {
    const today = new Date()
    return {
      from: firstAt === undefined ? undefined : startOfDay(today).getTime(),
      to: lastAt === undefined ? undefined : endOfDay(today).getTime(),
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

/** "Aug 24, 2026", "Aug 20 – Sep 23, 2026" or "Dec 20, 2025 – Jan 3, 2026". */
function rangeLabel(dates: ReturnType<typeof profitRangeDates>) {
  if (dates.from === undefined || dates.to === undefined) return "No dates yet"
  const from = new Date(dates.from)
  const to = new Date(dates.to)
  if (isSameDay(from, to)) return format(to, "MMM d, yyyy")
  if (isSameYear(from, to)) {
    return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
  }
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`
}

function shortDate(at: number) {
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function longDate(at: unknown) {
  return typeof at === "number"
    ? new Date(at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : ""
}

/** "$300.00" and "-$100.00", never "$-100.00". */
function axisUsd(value: number) {
  return value < 0 ? `-${formatUsd(-value)}` : formatUsd(value)
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
  const selectedWallet = answered.find(
    (wallet) => wallet.id === selectedWalletId
  )
  const figures = selectedWallet
    ? walletFigures(selectedWallet)
    : totalFigures(answered)
  const profitShare =
    figures.balance > 0 ? figures.madeOrLost / figures.balance : null
  const series = profitSeries(overview)
  const shown =
    series.find(
      (one) => selectedWallet && one.walletId === selectedWallet.id
    ) ?? series[0]
  const data = mergeTradingOverviewProfitSeries(series)
  const rangeDates = profitRangeDates(data, range)
  const missing = overview.wallets.filter(
    (wallet) => wallet.summary.state === "unreachable"
  ).length

  return (
    <Card className={cn("min-h-0 gap-0 py-0", className)}>
      <DashboardCardHeader className="flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <h2 className="truncate">
              Profit and loss
              <span aria-hidden="true"> · </span>
              {shown.label}
            </h2>
            {missing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About missing wallet figures"
                    className="transition-colors hover:text-foreground"
                  >
                    <InfoIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {overview.missingVenues.join(" and ")} did not answer. The
                  total includes only the wallets that answered.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div
            aria-label="Current made or lost"
            className="mt-1.5 flex items-center gap-2"
          >
            <PnlAmount
              className={cn(
                "block font-mono text-3xl leading-none font-semibold tracking-tight tabular-nums",
                moneyTone(figures.madeOrLost)
              )}
            >
              {formatSignedUsd(figures.madeOrLost)}
            </PnlAmount>
            {profitShare === null ? null : (
              <TradeBadge
                tone={
                  figures.madeOrLost > 0
                    ? "made"
                    : figures.madeOrLost < 0
                      ? "lost"
                      : "neutral"
                }
                className="font-mono tabular-nums"
              >
                <PnlAmount>{formatChange(profitShare)}</PnlAmount>
              </TradeBadge>
            )}
          </div>
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
          selectedWalletId={selectedWallet?.id ?? null}
          onSelectWallet={setSelectedWalletId}
        />
        <ProfitChart
          overview={overview}
          shown={shown}
          data={data}
          rangeDates={rangeDates}
          figures={figures}
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
  const [open, setOpen] = useState(false)
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
        <TabsList aria-label="Profit date range">
          {RANGE_PRESETS.map((preset) => (
            <TabsTrigger key={preset} value={preset} className="px-2.5">
              {RANGE_LABELS[preset]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DisabledReason
        disabled={data.length === 0}
        reason="No profit history to pick a range from yet"
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={data.length === 0}
              aria-label={`Dates shown: ${rangeLabel(dates)}`}
            >
              <CalendarIcon className="size-4 text-muted-foreground" />
              {rangeLabel(dates)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-72 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pnl-from-date">From</Label>
              <DatePicker
                id="pnl-from-date"
                value={
                  dates.from === undefined ? undefined : new Date(dates.from)
                }
                onChange={chooseFrom}
                placeholder="From"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pnl-to-date">To</Label>
              <DatePicker
                id="pnl-to-date"
                value={dates.to === undefined ? undefined : new Date(dates.to)}
                onChange={chooseTo}
                placeholder="To"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  choosePreset("all")
                  setOpen(false)
                }}
              >
                Reset
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </DisabledReason>
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
  const [showEmpty, setShowEmpty] = useState(false)
  const [sort, rememberSort] = useRememberedChoice<WalletSort>(
    WALLET_SORT_STORAGE_KEY,
    "result-desc",
    WALLET_SORTS
  )
  const [sortKey, sortDirection] = sort.split("-") as [
    WalletSortKey,
    "asc" | "desc",
  ]
  const total = totalFigures(answered)
  const missing = overview.wallets.filter(
    (wallet) => wallet.summary.state === "unreachable"
  ).length
  const wallets = visibleWallets(overview)
  const emptyCount = wallets.filter(isEmptyWallet).length
  const orderedWallets = [...wallets]
    .filter((wallet) => showEmpty || !isEmptyWallet(wallet))
    .sort((left, right) => {
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
  const toggleEmpty = () => {
    // Folding the empty wallets away must not leave the chart on a row that
    // is no longer in the list.
    const selected = wallets.find((wallet) => wallet.id === selectedWalletId)
    if (showEmpty && selected && isEmptyWallet(selected)) onSelectWallet(null)
    setShowEmpty(!showEmpty)
  }

  return (
    <section
      aria-label="Wallets"
      className="flex min-h-0 flex-col border-b lg:border-b-0"
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-6 pt-3 pb-1.5 text-sm text-muted-foreground">
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
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-auto">
        <div className="grid gap-0.5 px-3 pb-3">
          <WalletResultRow
            label="All wallets"
            detail={`${answered.length.toLocaleString()} connected${missing ? ` · ${missing.toLocaleString()} missing` : ""}`}
            balance={total.balance}
            madeOrLost={total.madeOrLost}
            selected={selectedWalletId === null}
            onSelect={() => onSelectWallet(null)}
          />
          {orderedWallets.map((wallet) =>
            wallet.summary.state !== "ok" || !wallet.performance ? (
              <UnavailableWalletRow key={wallet.id} wallet={wallet} />
            ) : (
              <WalletResultRow
                key={wallet.id}
                label={wallet.label}
                detail={wallet.venue}
                balance={wallet.summary.equity}
                madeOrLost={wallet.performance.madeOrLost}
                selected={selectedWalletId === wallet.id}
                onSelect={() => onSelectWallet(wallet.id)}
              />
            )
          )}
          {emptyCount ? (
            <button
              type="button"
              onClick={toggleEmpty}
              className={cn(
                "cursor-pointer justify-self-start rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                focusRing
              )}
            >
              {showEmpty
                ? `Hide ${emptyCount.toLocaleString()} empty ${emptyCount === 1 ? "wallet" : "wallets"}`
                : `Show ${emptyCount.toLocaleString()} empty ${emptyCount === 1 ? "wallet" : "wallets"}`}
            </button>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  )
}

function WalletResultRow({
  label,
  detail,
  balance,
  madeOrLost,
  selected,
  onSelect,
}: {
  label: string
  detail: string
  balance: number
  madeOrLost: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-2.5 text-left transition-colors",
        focusRing,
        selected ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <span className="truncate text-sm font-medium">{label}</span>
      <PnlAmount
        className={cn(
          "text-right font-mono text-sm font-semibold tabular-nums",
          moneyTone(madeOrLost)
        )}
      >
        {formatSignedUsd(madeOrLost)}
      </PnlAmount>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
      <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
        {formatUsd(balance)}
      </span>
    </button>
  )
}

function UnavailableWalletRow({ wallet }: { wallet: TradingOverviewWallet }) {
  return (
    <div className="grid gap-0.5 px-3 py-2.5">
      <span className="truncate text-sm font-medium text-muted-foreground">
        {wallet.label}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {wallet.venue} did not answer
      </span>
    </div>
  )
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[0.8rem] font-medium tabular-nums">
        {children}
      </dd>
    </div>
  )
}

function ProfitChart({
  overview,
  shown,
  data,
  rangeDates,
  figures,
}: {
  overview: TradingOverview
  shown: ProfitSeries
  data: TradingOverviewProfitChartPoint[]
  rangeDates: ReturnType<typeof profitRangeDates>
  figures: Figures
}) {
  const shownData =
    rangeDates.from === undefined || rangeDates.to === undefined
      ? []
      : filterTradingOverviewProfitSeries(data, rangeDates.from, rangeDates.to)
  const firstAt = shownData[0]?.at ?? 0
  const lastAt = shownData.at(-1)?.at ?? 0
  // Five evenly spaced dates, the first and last on the chart's edges.
  const ticks =
    lastAt > firstAt
      ? [0, 1, 2, 3, 4].map((step) => firstAt + ((lastAt - firstAt) * step) / 4)
      : [firstAt]
  const config = {
    [shown.key]: { label: shown.label, color: "var(--foreground)" },
  } satisfies ChartConfig

  return (
    <section
      aria-label={`${shown.label} profit history`}
      className="flex min-h-72 min-w-0 flex-col px-5 pt-4 pb-3"
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <dl className="flex flex-wrap gap-x-[1.6rem] gap-y-[0.6rem]">
          <Figure label="Balance">{formatUsd(figures.balance)}</Figure>
          <Figure label="Settled">
            <PnlAmount className={moneyTone(figures.settled)}>
              {formatSignedUsd(figures.settled)}
            </PnlAmount>
          </Figure>
          <Figure label="Open">
            <PnlAmount className={moneyTone(figures.open)}>
              {formatSignedUsd(figures.open)}
            </PnlAmount>
          </Figure>
          <Figure label="Fees">{formatUsd(figures.fees)}</Figure>
        </dl>
        {overview.unpricedFills ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ml-auto flex items-center gap-1 self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
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
      {shownData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {data.length === 0
            ? "No real trades have been recorded yet."
            : "No recorded results fall inside these dates."}
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 min-h-64 w-full flex-1">
          <AreaChart
            data={shownData}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pnl-graph-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={`var(--color-${shown.key})`}
                  stopOpacity={0.08}
                />
                <stop
                  offset="100%"
                  stopColor={`var(--color-${shown.key})`}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="at"
              type="number"
              domain={[firstAt, lastAt]}
              ticks={ticks}
              tick={({ x, y, index, payload, width }) =>
                // A narrow chart keeps the first, middle and last dates so
                // neighbouring labels never touch.
                Number(width) < 480 && index % 2 === 1 ? (
                  <g />
                ) : (
                  // The first and last dates sit flush with the line's ends
                  // instead of hanging off the card's edges.
                  <text
                    x={x}
                    y={y}
                    dy={12}
                    className="fill-muted-foreground"
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === ticks.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {shortDate(Number(payload.value))}
                  </text>
                )
              }
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              tick={({ x, y, payload }) => (
                <text
                  x={x}
                  y={y}
                  dy={4}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono"
                >
                  {axisUsd(Number(payload.value))}
                </text>
              )}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <ReferenceLine
              y={0}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
              strokeDasharray="4 4"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    longDate(payload?.[0]?.payload?.at)
                  }
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {shown.label}
                      </span>
                      <PnlAmount className="font-mono font-medium tabular-nums">
                        {formatSignedUsd(Number(value))}
                      </PnlAmount>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="linear"
              dataKey={shown.key}
              isAnimationActive={false}
              stroke={`var(--color-${shown.key})`}
              strokeWidth={1.75}
              fill="url(#pnl-graph-fill)"
              connectNulls
              activeDot={{
                r: 4,
                fill: `var(--color-${shown.key})`,
                stroke: "var(--background)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  )
}
