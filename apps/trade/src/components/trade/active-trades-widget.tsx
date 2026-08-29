import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { MarketIcon } from "@/components/trade/market-icon"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  TradeTablePanel,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { marketChartHref } from "@/lib/protocols/contracts"
import type {
  TradingOverview,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"
import { summarizeActiveTrades } from "@/lib/trade/dashboard/active-trades"
import { formatChange, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { stickyPanelSectionBarClassName } from "@/lib/layout/panel-section-bar"
import { cn } from "@/lib/utils"

type ActiveTradeColumn = "market" | "type" | "value" | "profit"

const ACTIVE_TRADE_COLUMNS = [
  { key: "market", label: "Ticker" },
  { key: "type", label: "Type" },
  { key: "value", label: "Value" },
  { key: "profit", label: "P/L" },
] as const satisfies readonly ColumnSpec<ActiveTradeColumn>[]

function defaultDirection(column: ActiveTradeColumn) {
  return column === "value" || column === "profit"
    ? ("desc" as const)
    : ("asc" as const)
}

export function ActiveTradesWidget({
  overview,
  className,
  onTradeOpen,
}: {
  overview: Pick<TradingOverview, "activeTrades" | "activeTradesUnavailable">
  className: string
  onTradeOpen?: () => void
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
        case "type":
          return trade.side
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
  const emptyWords =
    protocol || walletId
      ? "No active trades match these filters."
      : overview.activeTradesUnavailable.length
        ? "No active trades found in the wallets that answered."
        : "No active trades across your wallets."

  return (
    <TradeTablePanel
      className={cn("min-h-0", className)}
      header={
        <DashboardCardTitleHeader
          className="border-b-0"
          icon={<ListChecksIcon />}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">Active Trades</span>
              <Badge variant="secondary">
                {trades.length.toLocaleString()}
              </Badge>
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
      }
      columns={ACTIVE_TRADE_COLUMNS}
      rows={trades}
      loading={false}
      failed={false}
      loadingLabel="Loading active trades"
      failedWords="Active trades could not be loaded."
      emptyWords={emptyWords}
      stateClassName="flex min-h-24 items-center justify-center text-sm"
      onRetry={() => undefined}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      renderRow={(trade) => (
        <ActiveTradeRow
          key={trade.id}
          trade={trade}
          onOpen={() => {
            onTradeOpen?.()
            const href = marketChartHref(trade.marketKey)
            if (href) void navigate({ href })
          }}
        />
      )}
      footer={trades.length ? <ActiveTradesFooter summary={summary} /> : null}
    />
  )
}

function ActiveTradesFooter({
  summary,
}: {
  summary: ReturnType<typeof summarizeActiveTrades>
}) {
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
          {trade.accountType === "Real" ? null : (
            <AccountTypeBadge type={trade.accountType} />
          )}
        </span>
      </TableCell>
      <TableCell column="meta" className="py-2.5">
        <TradeBadge tone={trade.side === "long" ? "made" : "lost"}>
          {trade.side === "long" ? "Long" : "Short"}
        </TradeBadge>
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
