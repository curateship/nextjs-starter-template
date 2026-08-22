import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon, ListFilterIcon } from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { MarketIcon } from "@/components/trade/market-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { marketChartHref } from "@/lib/protocols/contracts"
import type {
  TradingOverview,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"
import { formatChange, formatPrice, formatSignedUsd } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

type ActiveTradeColumn = "market" | "protocol" | "wallet" | "entry" | "profit"

function defaultDirection(column: ActiveTradeColumn) {
  return column === "entry" || column === "profit"
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
        case "entry":
          return trade.entry
        case "profit":
          return trade.profit ?? Number.NEGATIVE_INFINITY
      }
    }
    return [...filtered].sort((left, right) => {
      if (
        sort === "profit" &&
        (left.profit === null) !== (right.profit === null)
      ) {
        return left.profit === null ? 1 : -1
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
      <WorkspacePanelHeader
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
        viewportClassName="h-full min-h-24 [&>div]:block!"
      >
        <Table containerClassName="overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-muted/50">
          <TableHeader>
            <TableRow>
              <TableHead column="meta">{heading("market", "Market")}</TableHead>
              <TableHead column="meta">
                {heading("protocol", "Protocol")}
              </TableHead>
              <TableHead column="meta">{heading("wallet", "Wallet")}</TableHead>
              <TableHead column="meta">{heading("entry", "Entry")}</TableHead>
              <TableHead column="meta">{heading("profit", "P/L")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overview.activeTradesUnavailable.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="bg-amber-500/5 py-2 text-sm text-amber-700 dark:text-amber-400"
                >
                  Could not read {overview.activeTradesUnavailable.join(", ")}.
                  Their active trades may be missing.
                </TableCell>
              </TableRow>
            ) : null}
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
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
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
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              trade.side === "long"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/10 text-red-700 dark:text-red-400"
            )}
          >
            {trade.side === "long" ? "Long" : "Short"} {trade.leverage}×
          </span>
          <AccountTypeBadge type={trade.accountType} />
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
        {formatPrice(trade.entry)}
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
  type: TradingOverviewActiveTrade["accountType"]
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        type === "Real" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        type === "Testnet" && "bg-sky-500/10 text-sky-700 dark:text-sky-400",
        type === "Practice" && "bg-muted text-muted-foreground"
      )}
    >
      {type}
    </span>
  )
}

function moneyTone(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400"
  if (value < 0) return "text-destructive"
  return "text-muted-foreground"
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
  const [open, setOpen] = React.useState(false)
  const protocols = countedOptions(trades, (trade) => trade.protocol)
  const wallets = countedOptions(trades, (trade) => trade.walletId).map(
    (option) => ({
      ...option,
      label:
        trades.find((trade) => trade.walletId === option.value)?.walletLabel ??
        option.value,
    })
  )
  const active = Number(Boolean(protocol)) + Number(Boolean(walletId))

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
          label="Protocol"
          total={trades.length}
          value={protocol}
          options={protocols}
          onChange={onProtocolChange}
        />
        <div className="border-t" />
        <FilterGroup
          label="Wallet"
          total={trades.length}
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
  trades: TradingOverviewActiveTrade[],
  valueOf: (trade: TradingOverviewActiveTrade) => string
) {
  const counts = new Map<string, number>()
  for (const trade of trades) {
    const value = valueOf(trade)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
