import * as React from "react"

import { TradeTable, type TradeTableRow } from "@/components/trade-table"

import { signedUsd, toneClass } from "@/components/backtest/backtest-format"
import type { BotRoundTrip } from "@/components/bots/bot-round-trips"
import { formatPriceDisplay } from "@/components/trading/format"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  STICKY_SCROLL_OVERRIDES,
  STICKY_TABLE_HEADER,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BotDetailResponse } from "@/lib/api/bots"
import { cn } from "@/lib/utils"

/**
 * Bottom panel of the bot workspace: Trades / Open Orders / Events tabs with
 * the same trade-list shape as the backtest strategy tester — round trips
 * (entry → exit cycles), not raw fills.
 */
export function BotActivityTabs({
  trips,
  openOrders,
  events,
  stats,
  selectedTradeId = null,
  onSelectTrade,
}: {
  trips: BotRoundTrip[]
  openOrders: BotDetailResponse["open_orders"]
  events: BotDetailResponse["events"]
  stats: BotDetailResponse["stats"]
  /** Highlighted trip row — clicking it again clears the selection. */
  selectedTradeId?: string | null
  onSelectTrade?: (tradeId: string | null) => void
}) {
  const closedCount = trips.filter((trip) => !trip.open).length
  const netProfit = stats.realized_pnl
  return (
    <Tabs defaultValue="trades" className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex items-center gap-4 bg-muted/50 px-4">
        <TabsList
          variant="line"
          className="h-auto gap-4 rounded-none border-none bg-transparent p-0"
        >
          {[
            ["trades", `Trades${trips.length ? ` (${trips.length})` : ""}`],
            [
              "orders",
              `Open Orders${openOrders.length ? ` (${openOrders.length})` : ""}`,
            ],
            ["events", "Events"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-none px-0 py-2.5 text-xs font-semibold group-data-horizontal/tabs:after:bottom-0"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="ml-auto flex items-center gap-4 text-[11px]">
          <span className="flex gap-1.5">
            <span className="text-muted-foreground">Net Profit</span>
            <span className={cn("font-mono", toneClass(netProfit))}>
              {signedUsd(netProfit)}
            </span>
          </span>
          <span className="flex gap-1.5">
            <span className="text-muted-foreground">Closed Trades</span>
            <span className="font-mono">{closedCount}</span>
          </span>
        </div>
      </div>

      <ScrollArea className={cn("min-h-0 flex-1", STICKY_SCROLL_OVERRIDES)}>
        <TabsContent value="trades" className="m-0">
          <BotTradesTable
            trips={trips}
            selectedTradeId={selectedTradeId}
            onSelectTrade={onSelectTrade}
          />
        </TabsContent>
        <TabsContent value="orders" className="m-0">
          <BotOrdersTable orders={openOrders} />
        </TabsContent>
        <TabsContent value="events" className="m-0">
          <BotEventsList events={events} />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  )
}

/** Adapts bot round trips to the shared trade table (open cycle pinned). */
function BotTradesTable({
  trips,
  selectedTradeId,
  onSelectTrade,
}: {
  trips: BotRoundTrip[]
  selectedTradeId?: string | null
  onSelectTrade?: (tradeId: string | null) => void
}) {
  const rows = React.useMemo<TradeTableRow[]>(
    () =>
      trips
        .filter((trip) => !trip.open)
        .map((trip) => ({
          id: trip.id,
          n: trip.n,
          side: trip.side,
          entryTime: trip.entryTime,
          exitTime: trip.exitTime,
          amount: trip.amount,
          pnl: trip.pnl,
          returnPct: trip.returnPct,
          cumPnl: trip.cumPnl,
        })),
    [trips]
  )
  const open = trips.find((trip) => trip.open) ?? null
  const openRow = React.useMemo<TradeTableRow | null>(
    () =>
      open
        ? {
            id: open.id,
            n: open.n,
            side: open.side,
            entryTime: open.entryTime,
            exitTime: null,
            amount: open.amount,
            pnl: open.pnl,
            returnPct: null,
            cumPnl: null,
          }
        : null,
    [open]
  )

  return (
    <TradeTable
      rows={rows}
      openRow={openRow}
      selectedId={selectedTradeId}
      onSelect={(id) => onSelectTrade?.(id)}
      emptyText="No trades yet."
    />
  )
}

function BotOrdersTable({
  orders,
}: {
  orders: BotDetailResponse["open_orders"]
}) {
  if (orders.length === 0) {
    return <Empty text="No resting orders." />
  }
  return (
    <Table>
      <TableHeader className={STICKY_TABLE_HEADER}>
        <TableRow>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id} className="font-mono text-[11px]">
            <TableCell
              className={cn(
                "font-sans font-semibold",
                order.side === "buy" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {order.side === "buy" ? "Buy" : "Sell"}
            </TableCell>
            <TableCell className="text-right">
              {order.px ? formatPriceDisplay(order.px) : "market"}
            </TableCell>
            <TableCell className="text-right">{order.sz}</TableCell>
            <TableCell className="text-muted-foreground">
              {order.purpose}
            </TableCell>
            <TableCell className="font-sans text-xs text-muted-foreground">
              {order.status}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function BotEventsList({ events }: { events: BotDetailResponse["events"] }) {
  if (events.length === 0) {
    return <Empty text="No events yet." />
  }
  return (
    <div className="flex flex-col gap-1 p-3">
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-2 text-xs">
          <span className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
            {new Date(event.created_at).toLocaleTimeString("en-US", {
              hour12: false,
            })}
          </span>
          <Badge
            variant={
              event.level === "error"
                ? "destructive"
                : event.level === "warn"
                  ? "outline"
                  : "secondary"
            }
            className="shrink-0 px-1 py-0 text-[9px]"
          >
            {event.type}
          </Badge>
          <span className="min-w-0 break-words">{event.message}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}
