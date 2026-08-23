import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ChartNoAxesCombinedIcon,
  InfoIcon,
  LayoutDashboardIcon,
  ListIcon,
  ListFilterIcon,
  WalletCardsIcon,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import {
  DashboardPanels,
  type DashboardBlock,
} from "@/components/shared/dashboard/dashboard-panels"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  TableSurface,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatClockTime,
  formatDate,
  formatDateTime,
} from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import type {
  TradingOverview,
  TradingOverviewFill,
  TradingOverviewWallet,
} from "@/lib/trade/dashboard/overview"
import {
  findTradingDashboardWidget,
  isTradingDashboardEmpty,
  type TradingDashboardWidgetId,
  type TradingDashboardWidgetLayout,
  type TradingDashboardWidgetSlot,
} from "@/lib/trade/dashboard/widgets"
import {
  formatCompactUsd,
  formatPrice,
  formatSignedUsd,
  formatUsd,
} from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

const moneyChartConfig: ChartConfig = {
  money: { label: "Money", color: "var(--foreground)" },
}

export function TradingOverviewDashboard({
  overview,
  layout,
}: {
  overview: TradingOverview
  layout: TradingDashboardWidgetLayout
}) {
  const blocksIn = (slot: TradingDashboardWidgetSlot): DashboardBlock[] =>
    layout[slot].flatMap((id) => {
      const widget = findTradingDashboardWidget(id)
      if (!widget) return []
      return [
        {
          id,
          size: widget.size,
          minSize: widget.minSize,
          render: (className: string) => renderWidget(id, overview, className),
        },
      ]
    })

  if (isTradingDashboardEmpty(layout)) {
    return <EmptyBoard />
  }

  const left = blocksIn("left")
  const right = blocksIn("right")
  return (
    <>
      {layout.top.map((id) => (
        <React.Fragment key={id}>
          {renderWidget(
            id,
            overview,
            id === "figures"
              ? "shrink-0"
              : id === "active-trades"
                ? "shrink-0 max-h-[34rem]"
                : "shrink-0 max-h-72"
          )}
        </React.Fragment>
      ))}
      {left.length || right.length ? (
        <DashboardPanels page="trading-overview" left={left} right={right} />
      ) : null}
    </>
  )
}

function renderWidget(
  id: TradingDashboardWidgetId,
  overview: TradingOverview,
  className: string
) {
  switch (id) {
    case "figures":
      return <HeadlineCard overview={overview} className={className} />
    case "wallets":
      return <WalletsCard wallets={overview.wallets} className={className} />
    case "equity":
      return <MoneyChart overview={overview} className={className} />
    case "active-trades":
      return <ActiveTradesWidget overview={overview} className={className} />
    case "trades":
      return <TradesTable overview={overview} className={className} />
  }
}

function answeredWallets(overview: TradingOverview) {
  return overview.wallets.filter(
    (
      wallet
    ): wallet is TradingOverviewWallet & {
      summary: Extract<TradingOverviewWallet["summary"], { state: "ok" }>
      performance: NonNullable<TradingOverviewWallet["performance"]>
    } => wallet.summary.state === "ok" && wallet.performance !== null
  )
}

function HeadlineCard({
  overview,
  className,
}: {
  overview: TradingOverview
  className: string
}) {
  const answered = answeredWallets(overview)
  const sum = (pick: (wallet: (typeof answered)[number]) => number) =>
    answered.reduce((total, wallet) => total + pick(wallet), 0)
  const balance = sum((wallet) => wallet.summary.equity)
  const journey = sum((wallet) => wallet.performance.madeOrLost)
  const settled = sum((wallet) => wallet.performance.settled)
  const open = sum((wallet) => wallet.performance.open)

  const figures = [
    {
      label: "Total balance",
      detail: `across ${answered.length.toLocaleString()} connected ${answered.length === 1 ? "wallet" : "wallets"}`,
      value: formatUsd(balance),
      tone: "text-foreground",
      hint: overview.missingVenues.length
        ? `${overview.missingVenues.join(" and ")} did not answer. All four figures are short.`
        : null,
    },
    {
      label: "Made or lost",
      detail: "from two days ago until now",
      value: formatSignedUsd(journey),
      rawValue: journey,
    },
    {
      label: "Settled",
      detail: "already banked",
      value: formatSignedUsd(settled),
      rawValue: settled,
    },
    {
      label: "Still open",
      detail: "unrealised on live trades",
      value: formatSignedUsd(open),
      rawValue: open,
    },
  ]

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={cn(
              "min-w-0 px-5 py-4 sm:px-6 sm:py-5",
              index > 0 && "border-t",
              index === 1 && "sm:border-t-0 sm:border-l",
              index === 2 && "xl:border-t-0 xl:border-l",
              index === 3 && "sm:border-l xl:border-t-0"
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <p
                className="truncate text-sm font-semibold"
                title={figure.label}
              >
                {figure.label}
              </p>
              {figure.hint ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About total balance"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <InfoIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    {figure.hint}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <p className="h-4 truncate text-xs text-muted-foreground">
              {figure.detail}
            </p>
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <p
                className={cn(
                  "truncate font-mono text-3xl leading-tight font-semibold tracking-tight tabular-nums",
                  figure.tone ?? moneyTone(figure.rawValue ?? 0)
                )}
                title={figure.value}
              >
                {figure.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function WalletsCard({
  wallets,
  className,
}: {
  wallets: TradingOverviewWallet[]
  className: string
}) {
  const { sort, direction, toggleSort } = useTableSort<WalletColumn>(
    "open",
    "desc",
    walletSortDirection
  )
  const biggestMove = Math.max(
    0,
    ...wallets.flatMap((wallet) =>
      wallet.performance ? [Math.abs(wallet.performance.madeOrLost)] : []
    )
  )
  const sortedWallets = React.useMemo(() => {
    const value = (wallet: TradingOverviewWallet): string | number => {
      if (sort === "wallet") return wallet.label
      if (sort === "protocol") return wallet.venue
      if (wallet.summary.state !== "ok" || !wallet.performance) return 0
      switch (sort) {
        case "balance":
          return wallet.summary.equity
        case "journey":
          return wallet.performance.madeOrLost
        case "settled":
          return wallet.performance.settled
        case "open":
          return wallet.summary.openProfit
      }
    }

    return [...wallets].sort((left, right) => {
      const leftAnswered = left.summary.state === "ok"
      const rightAnswered = right.summary.state === "ok"
      if (leftAnswered !== rightAnswered) return leftAnswered ? -1 : 1
      const a = value(left)
      const b = value(right)
      const compared =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b))
      return direction === "asc" ? compared : -compared
    })
  }, [direction, sort, wallets])
  const heading = (column: WalletColumn, label: string) => (
    <TableSortButton
      active={sort === column}
      direction={direction}
      onClick={() => toggleSort(column)}
    >
      {label}
    </TableSortButton>
  )

  return (
    <TableSurface className={cn("flex min-h-0 flex-col", className)}>
      <WorkspacePanelHeader
        icon={<WalletCardsIcon />}
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">Wallets</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About wallet results"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Made or lost is settled trade money the exchanges stated plus
                current open profit. Settled trades start at midnight two days
                ago in Toronto. Deposits and withdrawals never count as profit.
                Trades the exchange did not price are not included.
              </TooltipContent>
            </Tooltip>
          </span>
        }
      />
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="h-full min-h-24 [&>div]:block!"
      >
        <Table containerClassName="overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted/50">
          <TableHeader>
            <TableRow>
              <TableHead column="meta">{heading("wallet", "Wallet")}</TableHead>
              <TableHead column="meta">
                {heading("protocol", "Protocol")}
              </TableHead>
              <TableHead column="meta">
                {heading("balance", "Balance")}
              </TableHead>
              <TableHead column="meta">
                {heading("journey", "Made or lost")}
              </TableHead>
              <TableHead column="meta">
                {heading("settled", "Settled")}
              </TableHead>
              <TableHead column="meta">{heading("open", "Open")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No real wallets have been added yet.
                </TableCell>
              </TableRow>
            ) : (
              sortedWallets.map((wallet) => (
                <WalletRow
                  key={wallet.id}
                  wallet={wallet}
                  biggestMove={biggestMove}
                />
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
  )
}

type WalletColumn =
  "wallet" | "protocol" | "balance" | "journey" | "settled" | "open"

function walletSortDirection(column: WalletColumn) {
  return column === "wallet" || column === "protocol"
    ? ("asc" as const)
    : ("desc" as const)
}

function WalletRow({
  wallet,
  biggestMove,
}: {
  wallet: TradingOverviewWallet
  biggestMove: number
}) {
  const summary = wallet.summary
  const performance = wallet.performance
  if (summary.state !== "ok" || !performance) {
    return (
      <TableRow className="border-b text-muted-foreground">
        <TableCell column="meta" className="py-2.5 text-left">
          <WalletName
            wallet={wallet}
            muted
            off={summary.state === "inactive"}
          />
        </TableCell>
        <TableCell column="meta" className="py-2.5 text-left">
          {wallet.venue}
        </TableCell>
        <TableCell colSpan={4} className="py-2.5 text-left">
          {summary.state === "inactive"
            ? "Not asked, not counted"
            : `${wallet.venue} did not answer`}
        </TableCell>
      </TableRow>
    )
  }

  const barWidth = biggestMove
    ? Math.max(3, (Math.abs(performance.madeOrLost) / biggestMove) * 100)
    : 0

  return (
    <TableRow className="border-b">
      <TableCell column="meta" className="py-2.5 text-left">
        <WalletName wallet={wallet} />
      </TableCell>
      <TableCell
        column="meta"
        className="py-2.5 text-left text-muted-foreground"
      >
        <span className="block truncate" title={wallet.venue}>
          {wallet.venue}
        </span>
      </TableCell>
      <MoneyCell value={summary.equity} signed={false} />
      <TableCell column="meta" className="py-2.5 text-left">
        <div className="flex items-center justify-start gap-3">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted lg:block">
            <span
              className={cn(
                "block h-full rounded-full",
                performance.madeOrLost < 0 ? "bg-destructive" : "bg-emerald-600"
              )}
              style={{ width: `${barWidth}%` }}
            />
          </span>
          <MoneyValue value={performance.madeOrLost} />
        </div>
      </TableCell>
      <MoneyCell value={performance.settled} />
      <MoneyCell value={performance.open} />
    </TableRow>
  )
}

function WalletName({
  wallet,
  muted = false,
  off = false,
}: {
  wallet: TradingOverviewWallet
  muted?: boolean
  off?: boolean
}) {
  return (
    <div className={cn("min-w-0 text-left", muted && "opacity-70")}>
      <div className="flex items-center gap-2">
        <p className="truncate font-medium text-foreground">{wallet.label}</p>
        {off ? <Badge variant="secondary">Off</Badge> : null}
      </div>
    </div>
  )
}

function MoneyCell({
  value,
  signed = true,
}: {
  value: number
  signed?: boolean
}) {
  return (
    <TableCell column="meta" className="py-2.5 text-left">
      {signed ? (
        <MoneyValue value={value} />
      ) : (
        <span className="font-mono font-medium tabular-nums">
          {formatUsd(value)}
        </span>
      )}
    </TableCell>
  )
}

function MoneyValue({ value }: { value: number }) {
  return (
    <span
      className={cn("font-mono font-medium tabular-nums", moneyTone(value))}
    >
      {formatSignedUsd(value)}
    </span>
  )
}

function MoneyChart({
  overview,
  className,
}: {
  overview: TradingOverview
  className: string
}) {
  const data = overview.profit.map((point) => ({
    at: point.at,
    label: new Date(point.at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    }),
    money: point.money,
  }))
  const latest = data.at(-1)

  return (
    <Card className={cn("min-h-0 gap-0 py-0", className)}>
      <WorkspacePanelHeader
        icon={<ChartNoAxesCombinedIcon />}
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">Money over time</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About money over time"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Profit since midnight two days ago: settled trade money plus
                current open profit. Deposits and withdrawals are excluded.
                {overview.unpricedFills
                  ? ` The line is short of ${overview.unpricedFills.toLocaleString()} ${overview.unpricedFills === 1 ? "trade" : "trades"} whose money the exchange did not state.`
                  : ""}
              </TooltipContent>
            </Tooltip>
          </span>
        }
      />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 py-4">
        {latest ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-mono text-3xl leading-tight font-semibold tracking-tight tabular-nums">
              {formatUsd(latest.money)}
            </p>
            <p className="text-sm text-muted-foreground">
              current · since two days ago
            </p>
          </div>
        ) : null}
        {data.length === 0 ? (
          <div className="flex min-h-52 flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No real trades have been recorded yet.
            </p>
          </div>
        ) : (
          <div className="h-full min-h-[220px] w-full min-w-0 flex-1">
            <ChartContainer config={moneyChartConfig} className="h-full w-full">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="trading-overview-money-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-money)"
                      stopOpacity={0.16}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-money)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  width={52}
                  tickFormatter={formatCompactUsd}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        payload[0]?.payload?.at
                          ? formatDateTime(new Date(payload[0].payload.at))
                          : ""
                      }
                      formatter={(value) => formatUsd(Number(value))}
                    />
                  }
                />
                <Area
                  dataKey="money"
                  type="stepAfter"
                  isAnimationActive={false}
                  stroke="var(--color-money)"
                  strokeWidth={2}
                  fill="url(#trading-overview-money-fill)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type TradeColumn = "at" | "venue" | "wallet" | "money"

function defaultTradeDirection(column: TradeColumn) {
  return column === "at" || column === "money"
    ? ("desc" as const)
    : ("asc" as const)
}

function TradesTable({
  overview,
  className,
}: {
  overview: TradingOverview
  className: string
}) {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [venue, setVenue] = React.useState<string | null>(null)
  const [walletId, setWalletId] = React.useState<string | null>(null)
  const { sort, direction, toggleSort } = useTableSort<TradeColumn>(
    "at",
    "desc",
    defaultTradeDirection
  )
  const filtered = React.useMemo(
    () =>
      overview.fills.filter(
        (fill) =>
          (!venue || fill.venue === venue) &&
          (!walletId || fill.walletId === walletId)
      ),
    [overview.fills, venue, walletId]
  )
  const sorted = React.useMemo(() => {
    const value = (fill: TradingOverviewFill): string | number => {
      switch (sort) {
        case "at":
          return fill.at
        case "venue":
          return fill.venue
        case "wallet":
          return fill.walletLabel
        case "money":
          return fill.money ?? Number.NEGATIVE_INFINITY
      }
    }
    return [...filtered].sort((left, right) => {
      if (sort !== "at") {
        const dayCompared = tradeDayKey(right.at).localeCompare(
          tradeDayKey(left.at)
        )
        if (dayCompared) return dayCompared
      }
      const a = value(left)
      const b = value(right)
      const compared =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b))
      return direction === "asc" ? compared : -compared
    })
  }, [direction, filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )
  const unpriced = filtered.filter((fill) => fill.money === null).length

  const heading = (
    column: TradeColumn,
    label: string,
    hint?: React.ReactNode
  ) => (
    <div className="flex items-center gap-1">
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => {
          toggleSort(column)
          setPage(1)
        }}
      >
        {label}
      </TableSortButton>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )

  return (
    <TableSurface className={cn("flex h-full min-h-0 flex-col", className)}>
      <WorkspacePanelHeader
        icon={<ListIcon />}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">Trades</span>
            <Badge variant="secondary">{sorted.length.toLocaleString()}</Badge>
          </span>
        }
        action={
          <TradeFilters
            fills={overview.fills}
            venue={venue}
            walletId={walletId}
            onVenueChange={(next) => {
              setVenue(next)
              setPage(1)
            }}
            onWalletChange={(next) => {
              setWalletId(next)
              setPage(1)
            }}
            onClear={() => {
              setVenue(null)
              setWalletId(null)
              setPage(1)
            }}
          />
        }
      />
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="h-full min-h-24 [&>div]:block!"
      >
        <Table containerClassName="overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted">
          <TableHeader>
            <TableRow>
              <TableHead column="main">{heading("at", "Market")}</TableHead>
              <TableHead column="meta">
                {heading("venue", "Exchange")}
              </TableHead>
              <TableHead column="meta">{heading("wallet", "Wallet")}</TableHead>
              <TableHead column="meta">
                {heading(
                  "money",
                  "Money",
                  unpriced ? (
                    <>
                      The money total is short of {unpriced.toLocaleString()}{" "}
                      {unpriced === 1 ? "trade" : "trades"} the exchange did not
                      price.
                    </>
                  ) : null
                )}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {venue || walletId
                    ? "No trades match these filters."
                    : "No real trades have been recorded yet."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((fill, index) => {
                const day = tradeDayKey(fill.at)
                const previousDay = index
                  ? tradeDayKey(visible[index - 1].at)
                  : null
                return (
                  <React.Fragment key={`${fill.walletId}:${fill.fillId}`}>
                    {day !== previousDay ? <TradeDayRow at={fill.at} /> : null}
                    <TradeRow fill={fill} />
                  </React.Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DashboardTablePagination
        page={currentPage}
        pageSize={pageSize}
        total={sorted.length}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next)
          setPage(1)
        }}
        pageSizeOptions={[25, 50, 100]}
      />
    </TableSurface>
  )
}

function TradeRow({ fill }: { fill: TradingOverviewFill }) {
  return (
    <TableRow>
      <TableCell column="main" className="py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{fill.market}</span>
          <Badge
            variant={fill.side === "sell" ? "destructive" : "secondary"}
            className={
              fill.side === "buy"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : undefined
            }
          >
            {fill.side.toUpperCase()}
          </Badge>
        </div>
        <p
          className="mt-0.5 text-xs text-muted-foreground"
          title={formatDateTime(new Date(fill.at))}
        >
          {formatClockTime(new Date(fill.at))} · {formatPrice(fill.px)}
        </p>
      </TableCell>
      <TableCell column="meta">{fill.venue}</TableCell>
      <TableCell column="meta" className="text-muted-foreground">
        {fill.walletLabel}
      </TableCell>
      <TableCell column="meta" className="text-right">
        <p
          className={cn(
            "font-medium tabular-nums",
            fill.money === null
              ? "text-muted-foreground"
              : moneyTone(fill.money)
          )}
        >
          {fill.money === null ? "—" : formatSignedUsd(fill.money)}
        </p>
        <p className="text-xs text-muted-foreground">
          {fill.sz.toLocaleString()} · fee {formatUsd(fill.fee)}
        </p>
      </TableCell>
    </TableRow>
  )
}

function TradeDayRow({ at }: { at: number }) {
  const date = new Date(at)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const name = sameDay(date, today)
    ? "Today"
    : sameDay(date, yesterday)
      ? "Yesterday"
      : date.toLocaleDateString("en-US", { weekday: "long" })

  return (
    <TableRow>
      <TableCell
        colSpan={4}
        className="bg-muted/40 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {name} · {formatDate(date)}
      </TableCell>
    </TableRow>
  )
}

function TradeFilters({
  fills,
  venue,
  walletId,
  onVenueChange,
  onWalletChange,
  onClear,
}: {
  fills: TradingOverviewFill[]
  venue: string | null
  walletId: string | null
  onVenueChange: (venue: string | null) => void
  onWalletChange: (walletId: string | null) => void
  onClear: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const venues = countedOptions(fills, (fill) => fill.venue)
  const wallets = countedOptions(fills, (fill) => fill.walletId).map(
    (option) => ({
      ...option,
      label:
        fills.find((fill) => fill.walletId === option.value)?.walletLabel ??
        option.value,
    })
  )
  const active = Number(Boolean(venue)) + Number(Boolean(walletId))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilterIcon />
          Filter{active ? ` (${active})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-2 p-0">
        <FilterGroup
          label="Exchange"
          total={fills.length}
          value={venue}
          options={venues}
          onChange={onVenueChange}
        />
        <div className="border-t" />
        <FilterGroup
          label="Wallet"
          total={fills.length}
          value={walletId}
          options={wallets}
          onChange={onWalletChange}
        />
        <div className="flex items-center justify-between border-t p-2.5">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterGroup({
  label,
  total,
  value,
  options,
  onChange,
}: {
  label: string
  total: number
  value: string | null
  options: Array<{ value: string; label: string; count: number }>
  onChange: (value: string | null) => void
}) {
  return (
    <div className="grid gap-0.5 p-2.5">
      <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <FilterOption
        label="All"
        count={total}
        selected={!value}
        onClick={() => onChange(null)}
      />
      {options.map((option) => (
        <FilterOption
          key={option.value}
          label={option.label}
          count={option.count}
          selected={value === option.value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  )
}

function FilterOption({
  label,
  count,
  selected,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-between"
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className={cn(selected && "font-semibold")}>{label}</span>
      <span className={selected ? "text-primary" : "text-muted-foreground"}>
        {count.toLocaleString()}
      </span>
    </Button>
  )
}

function countedOptions(
  fills: TradingOverviewFill[],
  valueOf: (fill: TradingOverviewFill) => string
) {
  const counts = new Map<string, number>()
  for (const fill of fills) {
    const value = valueOf(fill)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function tradeDayKey(at: number) {
  const date = new Date(at)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function sameDay(left: Date, right: Date) {
  return tradeDayKey(left.getTime()) === tradeDayKey(right.getTime())
}

function EmptyBoard() {
  return (
    <Card className="shrink-0">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <LayoutDashboardIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          There are no widgets on the trading dashboard.
        </p>
        <Button asChild variant="outline">
          <Link to="/admin/settings/$tab" params={{ tab: "trading-widgets" }}>
            Choose widgets
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
