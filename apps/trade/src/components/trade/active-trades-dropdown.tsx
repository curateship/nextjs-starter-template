import { OrderDistanceBadge } from "@/components/trade/order-distance-badge"
import { orderDistance } from "@/lib/trade/order-distance"
import { useLiveMarks } from "@/lib/trade/live-market"
import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon, RadarIcon } from "lucide-react"

import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
import { ActiveTradesTable } from "@/components/trade/active-trades-widget"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import { MarketIcon } from "@/components/trade/market-icon"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  TradeTableContent,
  type ColumnSpec,
} from "@/components/trade/trade-table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { TableCell, TableRow, TableSurface } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { focusRing } from "@/lib/layout/focus-ring"
import { marketChartHref } from "@/lib/protocols/contracts"
import type {
  ActiveTradesSnapshot,
  TradingOverviewWatchingOrder,
} from "@/lib/trade/dashboard/overview"
import { orderKindLabel } from "@/lib/trade/dashboard/order-kind"
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

export function ActiveTradesDropdown({
  snapshot,
  className,
  onTradeOpen,
}: {
  snapshot: ActiveTradesSnapshot
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
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as DropdownTab)}
        className="max-h-full min-h-0 gap-0"
      >
        <DashboardCardTabsHeader
          action={
            <>
              <CountedFilterPopover
                items={filterItems}
                groups={[
                  {
                    label: "Exchange",
                    value: protocols,
                    valueOf: (order) => order.protocol,
                    onChange:
                      tab === "active"
                        ? setActiveProtocols
                        : setWatchingProtocols,
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
            </>
          }
        >
          <DashboardCardTab
            value="active"
            icon={<ListChecksIcon />}
            label="Active trades"
            count={snapshot.activeTrades.length}
          />
          <DashboardCardTab
            value="watching"
            icon={<RadarIcon />}
            label="Watching"
            count={snapshot.watchingOrders.length}
          />
        </DashboardCardTabsHeader>
        <TabsContent
          value="active"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <ActiveTradesTable
            trades={activeTrades}
            emptyWords={
              activeProtocols || activeWallets
                ? "No active trades match these filters."
                : snapshot.activeTradesUnavailable.length
                  ? "No active trades found in the wallets that answered."
                  : "No active trades across your wallets."
            }
            onTradeOpen={onTradeOpen}
          />
        </TabsContent>
        <TabsContent
          value="watching"
          className="flex min-h-0 flex-1 overflow-hidden"
        >
          <WatchingOrdersTable
            orders={watchingOrders}
            emptyWords={
              watchingProtocols || watchingWallets
                ? "No watched orders match these filters."
                : "Nothing is being watched across your wallets."
            }
            onTradeOpen={onTradeOpen}
          />
        </TabsContent>
      </Tabs>
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
  emptyWords,
  onTradeOpen,
}: {
  orders: readonly TradingOverviewWatchingOrder[]
  emptyWords: string
  onTradeOpen?: () => void
}) {
  const navigate = useNavigate()
  const { sort, direction, toggleSort } = useTableSort<WatchingColumn>(
    "market",
    "asc",
    defaultWatchingDirection
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
      columns={WATCHING_COLUMNS}
      rows={orders}
      loading={false}
      failed={false}
      loadingLabel="Loading watched orders"
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
            <TableCell
              column="meta"
              className="py-2.5 text-xs text-muted-foreground"
            >
              {orderKindLabel(order.orderKind)}
            </TableCell>
            <TableCell
              column="meta"
              className="py-2.5 text-xs text-muted-foreground"
            >
              {order.walletLabel}
            </TableCell>
            <TableCell column="meta" className="py-2.5 text-xs whitespace-nowrap">
              <OrderDistanceBadge distance={distances.get(order.id) ?? null} />
            </TableCell>
          </TableRow>
        )
      }}
    />
  )
}
