import { OrderDistanceBadge } from "@/components/trade/order-distance-badge"
import { orderDistance } from "@/lib/trade/order-distance"
import { useLiveMarks } from "@/lib/trade/live-market"
import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { TradeColumnsMenu } from "@/components/bots/trade-columns-menu"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { ActiveTradesTable } from "@/components/trade/active-trades-widget"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { MarketIcon } from "@/components/trade/market-icon"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  TradeTableContent,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { TableCell, TableRow, TableSurface } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { focusRing } from "@/lib/layout/focus-ring"
import { marketChartHref } from "@/lib/protocols/contracts"
import type {
  ActiveTradesSnapshot,
  TradingOverviewWatchingOrder,
} from "@/lib/trade/dashboard/overview"
import { orderKindLabel } from "@/lib/trade/dashboard/order-kind"
import type {
  HiddenTradeColumns,
  TradesPopoverKind,
} from "@/lib/trade/trades-popover-columns"
import { cn } from "@/lib/utils"

type DropdownTab = "active" | "watching"
type WatchingColumn = "market" | "order" | "wallet" | "distance"
type FilterableOrder = {
  protocol: string
  walletId: string
  walletLabel: string
}

const WATCHING_COLUMNS = [
  { key: "market", label: "Ticker" },
  { key: "order", label: "Order" },
  { key: "wallet", label: "Wallet" },
  { key: "distance", label: "Distance" },
] as const satisfies readonly ColumnSpec<WatchingColumn>[]

function defaultWatchingDirection(): "asc" {
  return "asc"
}

const NONE_HIDDEN: readonly never[] = []

/**
 * The header button's panel: Active trades and Watching as tabs drawn the way
 * Settings → Styling → Dashboard tabs says (Tyler, 13 Nov 2026: "Wire these
 * tabs into the tabs setting"), with the Filter and a ⋮ that hides the
 * showing tab's columns.
 */
export function ActiveTradesDropdown({
  snapshot,
  hidden,
  onHiddenChange,
  className,
  onTradeOpen,
}: {
  snapshot: ActiveTradesSnapshot
  /** Each tab's hidden columns, saved on the account. */
  hidden: HiddenTradeColumns
  onHiddenChange: (kind: TradesPopoverKind, columns: string[]) => void
  className?: string
  onTradeOpen?: () => void
}) {
  const [tab, setTab] = React.useState<DropdownTab>("active")
  const [activeProtocols, setActiveProtocols] = React.useState<string[] | null>(
    null
  )
  const [activeWallets, setActiveWallets] = React.useState<string[] | null>(
    null
  )
  const [watchingProtocols, setWatchingProtocols] = React.useState<
    string[] | null
  >(null)
  const [watchingWallets, setWatchingWallets] = React.useState<string[] | null>(
    null
  )

  const activeTrades = React.useMemo(
    () => filterOrders(snapshot.activeTrades, activeProtocols, activeWallets),
    [activeProtocols, activeWallets, snapshot.activeTrades]
  )
  const watchingOrders = React.useMemo(
    () =>
      filterOrders(snapshot.watchingOrders, watchingProtocols, watchingWallets),
    [snapshot.watchingOrders, watchingProtocols, watchingWallets]
  )
  const filterItems: readonly FilterableOrder[] =
    tab === "active" ? snapshot.activeTrades : snapshot.watchingOrders
  const protocols = tab === "active" ? activeProtocols : watchingProtocols
  const wallets = tab === "active" ? activeWallets : watchingWallets

  return (
    <TableSurface
      className={cn(
        "flex max-h-full min-h-0 w-full max-w-full flex-col rounded-[inherit] bg-popover shadow-none ring-0",
        className
      )}
    >
      <DashboardCardHeader>
        <DashboardTabs
          value={tab}
          onValueChange={(value) => setTab(value as DropdownTab)}
          tabs={[
            {
              value: "active",
              label: "Active trades",
              count: snapshot.activeTrades.length,
            },
            {
              value: "watching",
              label: "Watching",
              count: snapshot.watchingOrders.length,
            },
          ]}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CountedFilterPopover
            items={filterItems}
            groups={[
              {
                label: "Exchange",
                value: protocols,
                valueOf: (order) => order.protocol,
                onChange:
                  tab === "active" ? setActiveProtocols : setWatchingProtocols,
              },
              {
                label: "Wallet",
                value: wallets,
                valueOf: (order) => order.walletId,
                labelOf: (order) => order.walletLabel,
                onChange:
                  tab === "active" ? setActiveWallets : setWatchingWallets,
              },
            ]}
            onClear={() => {
              if (tab === "active") {
                setActiveProtocols(null)
                setActiveWallets(null)
              } else {
                setWatchingProtocols(null)
                setWatchingWallets(null)
              }
            }}
          />
          <span data-more-button className="flex">
            <TradeColumnsMenu
              kind={tab}
              hidden={hidden[tab] ?? NONE_HIDDEN}
              onChange={(columns) => onHiddenChange(tab, columns)}
            />
          </span>
        </div>
      </DashboardCardHeader>
      {tab === "active" ? (
        <ActiveTradesTable
          trades={activeTrades}
          hidden={hidden.active}
          emptyWords={
            activeProtocols || activeWallets
              ? "No active trades match these filters."
              : snapshot.activeTradesUnavailable.length
                ? "No active trades found in the wallets that answered."
                : "No active trades across your wallets."
          }
          onTradeOpen={onTradeOpen}
        />
      ) : (
        <WatchingOrdersTable
          orders={watchingOrders}
          hidden={hidden.watching ?? NONE_HIDDEN}
          emptyWords={
            watchingProtocols || watchingWallets
              ? "No watched orders match these filters."
              : "Nothing is being watched across your wallets."
          }
          onTradeOpen={onTradeOpen}
        />
      )}
    </TableSurface>
  )
}

function filterOrders<Order extends FilterableOrder>(
  orders: readonly Order[],
  protocols: readonly string[] | null,
  walletIds: readonly string[] | null
): Order[] {
  return orders.filter(
    (order) =>
      (!protocols || protocols.includes(order.protocol)) &&
      (!walletIds || walletIds.includes(order.walletId))
  )
}

function WatchingOrdersTable({
  orders: unsorted,
  hidden,
  emptyWords,
  onTradeOpen,
}: {
  orders: readonly TradingOverviewWatchingOrder[]
  hidden: readonly WatchingColumn[]
  emptyWords: string
  onTradeOpen?: () => void
}) {
  const navigate = useNavigate()
  const sorted = useTableSort<WatchingColumn>(
    "market",
    "asc",
    defaultWatchingDirection
  )
  const { toggleSort } = sorted
  const shows = (column: WatchingColumn) => !hidden.includes(column)
  // A hidden column cannot stay the sort; the rows go to A to Z by ticker.
  const kept = shows(sorted.sort)
  const sort = kept ? sorted.sort : "market"
  const direction = kept ? sorted.direction : "asc"
  const columns = React.useMemo(
    () => WATCHING_COLUMNS.filter((column) => !hidden.includes(column.key)),
    [hidden]
  )
  const marks = useLiveMarks(unsorted.map((order) => order.marketKey))
  const distances = React.useMemo(() => new Map(unsorted.map((order) => {
    const mark = marks.get(order.marketKey) ?? order.mark
    const values = order.waitingPrices.map((price) => orderDistance(price, mark))
      .filter((value): value is number => value !== null)
    return [order.id, values.length ? Math.min(...values) : null]
  })), [unsorted, marks])
  const orders = React.useMemo(() => {
    const valueOf = (order: TradingOverviewWatchingOrder): string | number => {
      switch (sort) {
        case "distance":
          return distances.get(order.id) ?? (direction === "asc" ? Infinity : -Infinity)
        case "market":
          return order.market
        case "order":
          return orderKindLabel(order.orderKind)
        case "wallet":
          return order.walletLabel
      }
    }
    return [...unsorted].sort((left, right) => {
      const a = valueOf(left)
      const b = valueOf(right)
      const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))
      if (compared !== 0) return direction === "asc" ? compared : -compared
      return right.createdAt - left.createdAt
    })
  }, [direction, sort, unsorted, distances])

  return (
    <TradeTableContent
      columns={columns}
      rows={orders}
      loading={false}
      failed={false}
      loadingLabel="Reading watched orders"
      failedWords="Watched orders could not be loaded."
      emptyWords={emptyWords}
      stateClassName="flex min-h-24 items-center justify-center text-sm"
      onRetry={() => undefined}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      renderRow={(order) => {
        const href = marketChartHref(order.marketKey)
        const open = () => {
          onTradeOpen?.()
          if (href) void navigate({ href })
        }
        return (
          <TableRow
            key={order.id}
            rowAction={href ? open : undefined}
            className="border-b"
          >
            <TableCell column="meta" className="py-2.5">
              <span className="flex items-center gap-2 whitespace-nowrap">
                <MarketIcon symbol={order.market} iconUrl={null} />
                {href ? (
                  <button
                    type="button"
                    onClick={open}
                    className={cn("rounded-sm text-xs font-medium hover:underline", focusRing)}
                  >
                    {order.market}
                  </button>
                ) : (
                  <span className="text-xs font-medium">{order.market}</span>
                )}
                {order.accountType === "Real" ? null : (
                  <TradeBadge
                    tone={
                      order.accountType === "Testnet" ? "testnet" : "neutral"
                    }
                  >
                    {order.accountType}
                  </TradeBadge>
                )}
              </span>
            </TableCell>
            {shows("order") ? (
              <TableCell
                column="meta"
                className="py-2.5 text-xs text-muted-foreground"
              >
                {orderKindLabel(order.orderKind)}
              </TableCell>
            ) : null}
            {shows("wallet") ? (
              <TableCell
                column="meta"
                className="py-2.5 text-xs text-muted-foreground"
              >
                {order.walletLabel}
              </TableCell>
            ) : null}
            {shows("distance") ? (
              <TableCell column="meta" className="py-2.5 text-xs whitespace-nowrap">
                <OrderDistanceBadge distance={distances.get(order.id) ?? null} />
              </TableCell>
            ) : null}
          </TableRow>
        )
      }}
    />
  )
}
