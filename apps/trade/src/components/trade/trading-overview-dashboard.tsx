import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  InfoIcon,
  LayoutDashboardIcon,
  ListIcon,
  ListFilterIcon,
} from "lucide-react"

import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import {
  DashboardPanels,
  type DashboardBlock,
} from "@/components/shared/dashboard/dashboard-panels"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import { PnlGraphWidget } from "@/components/trade/pnl-graph-widget"
import { RunningBotsWidget } from "@/components/trade/running-bots-widget"
import { TradeBadge } from "@/components/trade/trade-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
} from "@/lib/trade/dashboard/overview"
import {
  findTradingDashboardWidget,
  isTradingDashboardEmpty,
  type TradingDashboardWidgetId,
  type TradingDashboardWidgetLayout,
  type TradingDashboardWidgetSlot,
} from "@/lib/trade/dashboard/widgets"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

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
          stackedClassName: id === "running-bots" ? "h-72" : undefined,
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
            id === "equity"
              ? "min-h-[38rem] shrink-0 lg:h-[38rem]"
              : id === "active-trades"
                ? "shrink-0 max-h-[34rem]"
                : id === "running-bots"
                  ? "h-72 shrink-0"
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
    case "equity":
      return <PnlGraphWidget overview={overview} className={className} />
    case "active-trades":
      return <ActiveTradesWidget overview={overview} className={className} />
    case "running-bots":
      return <RunningBotsWidget bots={overview.bots} className={className} />
    case "trades":
      return <TradesTable overview={overview} className={className} />
  }
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
        viewportClassName="h-full min-h-24"
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
          <TradeBadge tone={fill.side === "buy" ? "made" : "lost"}>
            {fill.side.toUpperCase()}
          </TradeBadge>
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
