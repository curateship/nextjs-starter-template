import * as React from "react"
import { InfoIcon } from "lucide-react"

import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { WidgetCard, WidgetHeadingActions } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { MovingNowWidget } from "@/components/trade/market-explorer/moving-now-widget"
import { PnlGraphWidget } from "@/components/trade/pnl-graph-widget"
import { ProfitCalendarWidget } from "@/components/trade/profit-calendar-widget"
import { RunningBotsWidget } from "@/components/trade/running-bots-widget"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  BARE_TABLE,
  TradeTablePanel,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  getTradingOverviewErrorMessage,
  loadTradingOverviewPage,
} from "@/lib/api/trade/trading-overview"
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
  TRADING_WIDGET_OFFER,
  type TradingDashboardWidgetId,
} from "@/lib/trade/dashboard/widgets"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/** Matches the wallet panel without adding another fast account reader. */
const REFRESH_MS = 15_000

/**
 * The Trade dashboard's Overview (Tyler, 8 Nov 2026: "The widgets gets moved
 * to the middle like how shell does it"): Trade's six widgets in the shell's
 * rows, straight on the dashboard beside the left page, each in the shell's
 * widget card with its ⋮. The layout is held by the dashboard, because the
 * left page's ⋮ sets it too; this draws it.
 */
export function TradingOverviewGrid({
  overview,
  layout,
  onChange,
}: {
  overview: TradingOverview
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
}) {
  return (
    <WidgetGrid
      offer={TRADING_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id, menu) => {
        const widget = findTradingDashboardWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard
            title={widget.label}
            icon={<Icon />}
            count={widgetCount(widget.id, overview)}
            menu={<WidgetMenu title={widget.label} {...menu} />}
          >
            {renderWidget(widget.id, overview, WIDGET_FILL)}
          </WidgetCard>
        )
      }}
    />
  )
}

/** A widget fills its card's white tile, and its list scrolls inside it. */
const WIDGET_FILL = "h-full min-h-0 flex-1"

/** The number on a widget card's heading, for the widgets that list rows. */
function widgetCount(id: TradingDashboardWidgetId, overview: TradingOverview) {
  switch (id) {
    case "active-trades":
      return overview.activeTrades.length
    case "running-bots":
      return overview.bots.length
    case "trades":
      return overview.fills.length
    default:
      return undefined
  }
}

/**
 * Overview's figures while it is on screen: read as it opens, then every
 * fifteen seconds while the browser tab is visible. Hiding the tab stops the
 * clock; showing it makes one catch-up read. A failed read keeps the last
 * answer on screen, and says so only when there has never been one.
 */
export function useTradingOverview(active: boolean) {
  const [overview, setOverview] = React.useState<TradingOverview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!active) return
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
          if (stopped) return
          setOverview((was) => (was ? mergeTradingOverviewRefresh(was, fresh) : fresh))
          setError(null)
        })
        .catch((readError: unknown) => {
          if (!stopped) setError(getTradingOverviewErrorMessage(readError))
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

    run()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stopped = true
      clearTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [active, attempt])

  return {
    overview,
    // A failure after a good answer leaves that answer up, as before.
    error: overview ? null : error,
    retry: () => {
      setError(null)
      setAttempt((count) => count + 1)
    },
  }
}

function renderWidget(
  id: TradingDashboardWidgetId,
  overview: TradingOverview,
  className: string
) {
  switch (id) {
    case "moving-now":
      return <MovingNowWidget bare className={className} />
    case "equity":
      return <PnlGraphWidget bare overview={overview} className={className} />
    case "active-trades":
      return <ActiveTradesWidget bare overview={overview} className={className} />
    case "running-bots":
      return <RunningBotsWidget bare bots={overview.bots} className={className} />
    case "profit-calendar":
      return <ProfitCalendarWidget bare overview={overview} className={className} />
    case "trades":
      return <TradesTable overview={overview} className={className} />
  }
}

type TradeColumn = "at" | "venue" | "wallet" | "money"

const TRADE_COLUMNS = [
  { key: "at", label: "Market" },
  { key: "venue", label: "Exchange" },
  { key: "wallet", label: "Wallet" },
  { key: "money", label: "Money", align: "right" },
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
      className={cn(className, BARE_TABLE)}
      header={
        // The title and count are on the widget card's heading, and the
        // filter sits there too, beside the ⋮ ("move the buttons here").
        <WidgetHeadingActions>
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
        </WidgetHeadingActions>
      }
      columns={TRADE_COLUMNS}
      rows={visible}
      loading={false}
      failed={false}
      loadingLabel="Reading trades"
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
        <PnlAmount
          className={cn(
            "block font-medium tabular-nums",
            fill.money === null
              ? "text-muted-foreground"
              : moneyTone(fill.money)
          )}
        >
          {fill.money === null ? "—" : formatSignedUsd(fill.money)}
        </PnlAmount>
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
