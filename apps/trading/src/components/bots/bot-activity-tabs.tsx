import * as React from "react"

import { signedUsd, toneClass } from "@/components/backtest/backtest-format"
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
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BotDetailResponse } from "@/lib/api/bots"
import { cn } from "@/lib/utils"

type BotTrade = BotDetailResponse["trades"][number]

type TradeSortKey = "time" | "side" | "px" | "sz" | "notional" | "fee" | "pnl"

const TRADE_COLUMNS: {
  key: TradeSortKey
  label: string
  right?: boolean
  value: (trade: BotTrade) => number | string
}[] = [
  { key: "time", label: "Time", value: (t) => Date.parse(t.fill_time) },
  { key: "side", label: "Side", value: (t) => t.side },
  { key: "px", label: "Price", right: true, value: (t) => Number(t.px) },
  { key: "sz", label: "Size", right: true, value: (t) => Number(t.sz) },
  { key: "notional", label: "Notional", right: true, value: (t) => Number(t.notional) },
  { key: "fee", label: "Fee", right: true, value: (t) => Number(t.fee) },
  { key: "pnl", label: "PnL", right: true, value: (t) => Number(t.closed_pnl ?? 0) },
]

/**
 * Bottom activity panel of the bot workspace: Trades (sortable) / Open Orders /
 * Events, styled after the backtest strategy tester.
 */
export function BotActivityTabs({
  trades,
  openOrders,
  events,
  stats,
}: {
  trades: BotDetailResponse["trades"]
  openOrders: BotDetailResponse["open_orders"]
  events: BotDetailResponse["events"]
  stats: BotDetailResponse["stats"]
}) {
  return (
    <Tabs defaultValue="trades" className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex items-center gap-4 bg-muted/50 px-4">
        <TabsList
          variant="line"
          className="h-auto gap-4 rounded-none border-none bg-transparent p-0"
        >
          {[
            ["trades", `Trades${trades.length ? ` (${trades.length})` : ""}`],
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
        <div className="flex-1" />
        <div className="flex gap-4 py-2 text-[11px]">
          <span className="flex gap-1.5">
            <span className="text-muted-foreground">Realized PnL</span>
            <span className={cn("font-mono", toneClass(stats.realized_pnl))}>
              {signedUsd(stats.realized_pnl)}
            </span>
          </span>
          <span className="flex gap-1.5">
            <span className="text-muted-foreground">Fills</span>
            <span className="font-mono">{stats.trade_count}</span>
          </span>
        </div>
      </div>

      <ScrollArea className={cn("min-h-0 flex-1", STICKY_SCROLL_OVERRIDES)}>
        <TabsContent value="trades" className="m-0">
          <BotTradesTable trades={trades} />
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

function BotTradesTable({ trades }: { trades: BotDetailResponse["trades"] }) {
  const [sort, setSort] = React.useState<{
    key: TradeSortKey
    dir: TableSortDirection
  }>({ key: "time", dir: "desc" })

  const sortedTrades = React.useMemo(() => {
    const column =
      TRADE_COLUMNS.find((c) => c.key === sort.key) ?? TRADE_COLUMNS[0]
    const rows = [...trades]
    rows.sort((a, b) => {
      const av = column.value(a)
      const bv = column.value(b)
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sort.dir === "asc" ? cmp : -cmp
    })
    return rows
  }, [trades, sort])

  if (trades.length === 0) {
    return <Empty text="No fills yet." />
  }

  const toggleSort = (key: TradeSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    )

  return (
    <Table>
      <TableHeader className={STICKY_TABLE_HEADER}>
        <TableRow>
          {TRADE_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              className={column.right ? "text-right" : undefined}
            >
              <TableSortButton
                active={sort.key === column.key}
                direction={sort.dir}
                onClick={() => toggleSort(column.key)}
                className={column.right ? "ml-auto flex-row-reverse" : undefined}
              >
                {column.label}
              </TableSortButton>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedTrades.map((trade) => {
          const pnl = Number(trade.closed_pnl ?? 0)
          return (
            <TableRow key={trade.id} className="font-mono text-[11px]">
              <TableCell className="text-muted-foreground">
                {new Date(trade.fill_time).toLocaleString("en-US", {
                  hour12: false,
                })}
              </TableCell>
              <TableCell
                className={cn(
                  "font-sans font-semibold",
                  trade.side === "buy" ? "text-emerald-600" : "text-red-500"
                )}
              >
                {trade.side === "buy" ? "Buy" : "Sell"}
              </TableCell>
              <TableCell className="text-right">
                {formatPriceDisplay(trade.px)}
              </TableCell>
              <TableCell className="text-right">{trade.sz}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                ${Number(trade.notional).toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {Number(trade.fee).toFixed(4)}
              </TableCell>
              <TableCell
                className={cn("text-right", pnl !== 0 ? toneClass(pnl) : "text-muted-foreground")}
              >
                {pnl !== 0 ? signedUsd(pnl) : "—"}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
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
