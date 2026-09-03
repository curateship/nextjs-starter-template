import * as React from "react"
import { Link } from "@tanstack/react-router"
import { InfoIcon, LayoutDashboardIcon, ListIcon } from "lucide-react"

import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import {
  DashboardPanels,
  type DashboardBlock,
} from "@/components/shared/dashboard/dashboard-panels"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { PnlGraphWidget } from "@/components/trade/pnl-graph-widget"
import { RunningBotsWidget } from "@/components/trade/running-bots-widget"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  TradeTablePanel,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { loadTradingOverviewPage } from "@/lib/api/trade/trading-overview"
import {
  formatClockTime,
  formatDate,
  formatDateTime,
} from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  mergeTradingOverviewRefresh,
  type TradingOverview,
  type TradingOverviewFill,
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

/** Matches the wallet panel without adding another fast account reader. */
const REFRESH_MS = 15_000

export function TradingOverviewDashboard({
  overview,
  layout,
}: {
  overview: TradingOverview
  layout: TradingDashboardWidgetLayout
}) {
  const current = useCurrentOverview(overview, layout)

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
          render: (className: string) => renderWidget(id, current, className),
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
            current,
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

/**
 * Keeps one complete answer on screen. A failed read only moves the age label;
 * it never swaps good figures for an empty or partial response.
 */
function useCurrentOverview(
  initial: TradingOverview,
  layout: TradingDashboardWidgetLayout
) {
  const [read, setRead] = React.useState(() => ({
    from: initial,
    overview: initial,
    checkedAt: initial.readAt,
  }))
  let current = read
  if (read.from !== initial) {
    current = { from: initial, overview: initial, checkedAt: initial.readAt }
    setRead(current)
  }
  const hasWidgets = !isTradingDashboardEmpty(layout)

  React.useEffect(() => {
    if (!hasWidgets) return
    let stopped = false
    let timer: number | null = null
    let inFlight: Promise<void> | null = null

    const clearTimer = () => {
      if (timer === null) return
      window.clearTimeout(timer)
      timer = null
    }
    const schedule = () => {
      if (stopped || document.visibilityState !== "visible") return
      clearTimer()
      timer = window.setTimeout(run, REFRESH_MS)
    }
    const run = () => {
      timer = null
      if (stopped || document.visibilityState !== "visible" || inFlight) return
      const request = loadTradingOverviewPage()
        .then(({ overview: fresh }) => {
          if (!stopped) {
            setRead((was) => ({
              ...was,
              overview: mergeTradingOverviewRefresh(was.overview, fresh),
              checkedAt: Date.now(),
            }))
          }
        })
        .catch(() => {
          if (!stopped) {
            setRead((was) => ({ ...was, checkedAt: Date.now() }))
          }
        })
        .finally(() => {
          if (inFlight === request) inFlight = null
          schedule()
        })
      inFlight = request
    }
    const onVisibilityChange = () => {
      clearTimer()
      if (document.visibilityState === "visible" && !inFlight) run()
    }

    schedule()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stopped = true
      clearTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [hasWidgets])

  return current.overview
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

const TRADE_COLUMNS = [
  { key: "at", label: "Market" },
  { key: "venue", label: "Exchange" },
  { key: "wallet", label: "Wallet" },
  { key: "money", label: "Money" },
] as const satisfies readonly ColumnSpec<TradeColumn>[]

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
  const [venues, setVenues] = React.useState<string[] | null>(null)
  const [walletIds, setWalletIds] = React.useState<string[] | null>(null)
  const { sort, direction, toggleSort } = useTableSort<TradeColumn>(
    "at",
    "desc",
    defaultTradeDirection
  )
  const filtered = React.useMemo(
    () =>
      overview.fills.filter(
        (fill) =>
          (!venues || venues.includes(fill.venue)) &&
          (!walletIds || walletIds.includes(fill.walletId))
      ),
    [overview.fills, venues, walletIds]
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

  return (
    <TradeTablePanel
      className={className}
      header={
        <DashboardCardTitleHeader
          className="border-b-0"
          icon={<ListIcon />}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">Trades</span>
              <Badge variant="secondary">
                {sorted.length.toLocaleString()}
              </Badge>
            </span>
          }
          action={
            <TradeFilters
              fills={overview.fills}
              venues={venues}
              walletIds={walletIds}
              onVenuesChange={(next) => {
                setVenues(next)
                setPage(1)
              }}
              onWalletsChange={(next) => {
                setWalletIds(next)
                setPage(1)
              }}
              onClear={() => {
                setVenues(null)
                setWalletIds(null)
                setPage(1)
              }}
            />
          }
        />
      }
      columns={TRADE_COLUMNS}
      rows={visible}
      loading={false}
      failed={false}
      loadingLabel="Loading trades"
      failedWords="Trades could not be loaded."
      emptyWords={
        venues || walletIds
          ? "No trades match these filters."
          : "No real trades have been recorded yet."
      }
      stateClassName="flex min-h-24 items-center justify-center text-sm"
      onRetry={() => undefined}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        toggleSort(column)
        setPage(1)
      }}
      headerInfo={(column) =>
        column === "money" && unpriced ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About Money"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              The money total is short of {unpriced.toLocaleString()}{" "}
              {unpriced === 1 ? "trade" : "trades"} the exchange did not price.
            </TooltipContent>
          </Tooltip>
        ) : null
      }
      renderRow={(fill, index) => {
        const day = tradeDayKey(fill.at)
        const previousDay = index ? tradeDayKey(visible[index - 1].at) : null
        return (
          <React.Fragment key={`${fill.walletId}:${fill.fillId}`}>
            {day !== previousDay ? <TradeDayRow at={fill.at} /> : null}
            <TradeRow fill={fill} />
          </React.Fragment>
        )
      }}
      afterTable={
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
      }
    />
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
  venues,
  walletIds,
  onVenuesChange,
  onWalletsChange,
  onClear,
}: {
  fills: TradingOverviewFill[]
  venues: readonly string[] | null
  walletIds: readonly string[] | null
  onVenuesChange: (venues: string[] | null) => void
  onWalletsChange: (walletIds: string[] | null) => void
  onClear: () => void
}) {
  return (
    <CountedFilterPopover
      items={fills}
      groups={[
        {
          label: "Exchange",
          value: venues,
          valueOf: (fill) => fill.venue,
          onChange: onVenuesChange,
        },
        {
          label: "Wallet",
          value: walletIds,
          valueOf: (fill) => fill.walletId,
          labelOf: (fill) => fill.walletLabel,
          onChange: onWalletsChange,
        },
      ]}
      onClear={onClear}
    />
  )
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
