import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { MarketIcon } from "@/components/trade/market-icon"
import { TradeBadge } from "@/components/trade/trade-badge"
import { Badge } from "@/components/ui/badge"
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
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { marketChartHref } from "@/lib/protocols/contracts"
import type {
  TradingOverview,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"
import { formatChange, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  stickyPanelSectionBarClassName,
  stickyPanelTableHeaderClassName,
} from "@/lib/layout/panel-section-bar"
import { cn } from "@/lib/utils"

type ActiveTradeColumn = "market" | "protocol" | "wallet" | "value" | "profit"

function defaultDirection(column: ActiveTradeColumn) {
  return column === "value" || column === "profit"
    ? ("desc" as const)
    : ("asc" as const)
}

export function ActiveTradesWidget({
  overview,
  className,
}: {
  overview: TradingOverview
  className: string
}) {
  const navigate = useNavigate()
  const [protocol, setProtocol] = React.useState<string | null>(null)
  const [walletId, setWalletId] = React.useState<string | null>(null)
  const { sort, direction, toggleSort } = useTableSort<ActiveTradeColumn>(
    "profit",
    "desc",
    defaultDirection
  )
  const filtered = React.useMemo(
    () =>
      overview.activeTrades.filter(
        (trade) =>
          (!protocol || trade.protocol === protocol) &&
          (!walletId || trade.walletId === walletId)
      ),
    [overview.activeTrades, protocol, walletId]
  )
  const trades = React.useMemo(() => {
    const valueOf = (trade: TradingOverviewActiveTrade): string | number => {
      switch (sort) {
        case "market":
          return trade.market
        case "protocol":
          return trade.protocol
        case "wallet":
          return trade.walletLabel
        case "value":
          return trade.value ?? Number.NEGATIVE_INFINITY
        case "profit":
          return trade.profit ?? Number.NEGATIVE_INFINITY
      }
    }
    return [...filtered].sort((left, right) => {
      if (
        (sort === "profit" || sort === "value") &&
        (left[sort] === null) !== (right[sort] === null)
      ) {
        return left[sort] === null ? 1 : -1
      }
      const a = valueOf(left)
      const b = valueOf(right)
      const compared =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b))
      return direction === "asc" ? compared : -compared
    })
  }, [direction, filtered, sort])
  const summary = React.useMemo(() => summarizeActiveTrades(trades), [trades])
  const heading = (column: ActiveTradeColumn, label: string) => (
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
      <DashboardCardTitleHeader
        className="border-b-0"
        icon={<ListChecksIcon />}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">Active Trades</span>
            <Badge variant="secondary">{trades.length.toLocaleString()}</Badge>
          </span>
        }
        action={
          <ActiveTradeFilters
            trades={overview.activeTrades}
            protocol={protocol}
            walletId={walletId}
            onProtocolChange={setProtocol}
            onWalletChange={setWalletId}
            onClear={() => {
              setProtocol(null)
              setWalletId(null)
            }}
          />
        }
      />
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="h-full min-h-24"
      >
        <Table
          containerClassName={cn(
            "overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
            stickyPanelTableHeaderClassName
          )}
        >
          <TableHeader>
            <TableRow>
              <TableHead column="meta">{heading("market", "Market")}</TableHead>
              <TableHead column="meta">
                {heading("protocol", "Exchange")}
              </TableHead>
              <TableHead column="meta">{heading("wallet", "Wallet")}</TableHead>
              <TableHead column="meta">{heading("value", "Value")}</TableHead>
              <TableHead column="meta">{heading("profit", "P/L")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {protocol || walletId
                    ? "No active trades match these filters."
                    : overview.activeTradesUnavailable.length
                      ? "No active trades found in the wallets that answered."
                      : "No active trades across your wallets."}
                </TableCell>
              </TableRow>
            ) : (
              trades.map((trade) => (
                <ActiveTradeRow
                  key={trade.id}
                  trade={trade}
                  onOpen={() => {
                    const href = marketChartHref(trade.marketKey)
                    if (href) void navigate({ href })
                  }}
                />
              ))
            )}
          </TableBody>
          {trades.length ? <ActiveTradesFooter summary={summary} /> : null}
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
  )
}

type ActiveTradesSummary = {
  totalValue: number | null
  totalProfit: number | null
}

/** The complete totals for the rows currently shown. */
function summarizeActiveTrades(
  trades: readonly TradingOverviewActiveTrade[]
): ActiveTradesSummary {
  return {
    totalValue: completeTotal(trades.map((trade) => trade.value)),
    totalProfit: completeTotal(trades.map((trade) => trade.profit)),
  }
}

function completeTotal(values: readonly (number | null)[]) {
  if (values.length === 0) return null
  let total = 0
  for (const value of values) {
    if (value === null) return null
    total += value
  }
  return total
}

function ActiveTradesFooter({ summary }: { summary: ActiveTradesSummary }) {
  return (
    <tfoot className="sticky bottom-0 z-10">
      <TableRow className={stickyPanelSectionBarClassName}>
        <TableCell
          column="meta"
          className="py-2.5 text-xs font-medium text-muted-foreground"
        >
          Total
        </TableCell>
        <TableCell column="meta" aria-hidden />
        <TableCell column="meta" aria-hidden />
        <TableCell
          column="meta"
          className="py-2.5 text-left font-mono text-xs font-semibold tabular-nums"
        >
          <SummaryMoney value={summary.totalValue} />
        </TableCell>
        <TableCell column="meta" className="py-2.5 text-left text-xs">
          <SummaryProfit value={summary.totalProfit} />
        </TableCell>
      </TableRow>
    </tfoot>
  )
}

function SummaryMoney({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span>{formatUsd(value)}</span>
  )
}

function SummaryProfit({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("font-medium tabular-nums", moneyTone(value))}>
      {formatSignedUsd(value)}
    </span>
  )
}

function ActiveTradeRow({
  trade,
  onOpen,
}: {
  trade: TradingOverviewActiveTrade
  onOpen: () => void
}) {
  const chartHref = marketChartHref(trade.marketKey)
  return (
    <TableRow rowAction={chartHref ? onOpen : undefined} className="border-b">
      <TableCell column="meta" className="py-2.5">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <MarketIcon symbol={trade.market} iconUrl={null} />
          {chartHref ? (
            <button
              type="button"
              onClick={onOpen}
              className="rounded-sm text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {trade.market}
            </button>
          ) : (
            <span className="text-xs font-medium">{trade.market}</span>
          )}
          <TradeBadge tone={trade.side === "long" ? "made" : "lost"}>
            {trade.side === "long" ? "Long" : "Short"} {trade.leverage}×
          </TradeBadge>
          {trade.accountType === "Real" ? null : (
            <AccountTypeBadge type={trade.accountType} />
          )}
        </span>
      </TableCell>
      <TableCell column="meta" className="py-2.5 text-xs text-muted-foreground">
        {trade.protocol}
      </TableCell>
      <TableCell column="meta" className="py-2.5 text-xs text-muted-foreground">
        <span className="block max-w-32 truncate" title={trade.walletLabel}>
          {trade.walletLabel}
        </span>
      </TableCell>
      <TableCell
        column="meta"
        className="py-2.5 text-left font-mono text-xs tabular-nums"
      >
        {trade.value === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatUsd(trade.value)
        )}
      </TableCell>
      <TableCell column="meta" className="py-2.5 text-left text-xs">
        {trade.profit === null || trade.profitShare === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span
              className={cn(
                "font-medium tabular-nums",
                moneyTone(trade.profit)
              )}
            >
              {formatSignedUsd(trade.profit)}
            </span>{" "}
            <span
              className={cn("text-xs tabular-nums", moneyTone(trade.profit))}
            >
              {formatChange(trade.profitShare)}
            </span>
          </>
        )}
      </TableCell>
    </TableRow>
  )
}

function AccountTypeBadge({
  type,
}: {
  type: Exclude<TradingOverviewActiveTrade["accountType"], "Real">
}) {
  return (
    <TradeBadge tone={type === "Testnet" ? "testnet" : "neutral"}>
      {type}
    </TradeBadge>
  )
}

function ActiveTradeFilters({
  trades,
  protocol,
  walletId,
  onProtocolChange,
  onWalletChange,
  onClear,
}: {
  trades: TradingOverviewActiveTrade[]
  protocol: string | null
  walletId: string | null
  onProtocolChange: (protocol: string | null) => void
  onWalletChange: (walletId: string | null) => void
  onClear: () => void
}) {
  return (
    <CountedFilterPopover
      items={trades}
      groups={[
        {
          label: "Exchange",
          value: protocol,
          valueOf: (trade) => trade.protocol,
          onChange: onProtocolChange,
        },
        {
          label: "Wallet",
          value: walletId,
          valueOf: (trade) => trade.walletId,
          labelOf: (trade) => trade.walletLabel,
          onChange: onWalletChange,
        },
      ]}
      onClear={onClear}
    />
  )
}
