import * as React from "react"
import { ClientOnly, useRouter } from "@tanstack/react-router"
import { Loader2Icon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react"
import type { Layout } from "react-resizable-panels"

import { buildBotChartLines } from "@/components/bots/bot-chart-lines"
import { BotEditPanel } from "@/components/bots/bot-edit-panel"
import { BotStatusBadge } from "@/components/bots/fleet-dashboard"
import { formatPriceDisplay } from "@/components/trading/format"
import { PriceChart, type ChartMarker } from "@/components/trading/price-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getBotErrorMessage,
  loadBotDetail,
  sendCommand,
  type BotDetailResponse,
} from "@/lib/api/bots"
import { useAllMids } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { STRATEGY_LABELS } from "@/lib/strategies/params"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { cn } from "@/lib/utils"

export function BotDetail({
  botId,
  initial,
}: {
  botId: string
  initial: BotDetailResponse
}) {
  const router = useRouter()
  const { data, refresh } = useIntervalLoader(
    () => loadBotDetail(botId),
    initial
  )
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)

  const { bot, state, stats } = data
  const openOrders = data.open_orders
  const network = (bot.network === "mainnet" ? "mainnet" : "testnet") as TradingNetwork
  const winRate =
    stats.wins + stats.losses > 0
      ? (stats.wins / (stats.wins + stats.losses)) * 100
      : null

  const notify = React.useCallback(
    (text: string, tone: "ok" | "error") => {
      setNotice({ text, tone })
      setTimeout(() => void refresh(), 800)
    },
    [refresh]
  )

  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  async function run(
    command: "start" | "stop" | "pause" | "resume" | "flatten"
  ) {
    setBusy(true)
    try {
      await sendCommand(botId, command)
      await refresh()
    } catch (error) {
      notify(getBotErrorMessage(error), "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 w-full flex-col gap-2 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{bot.name}</h1>
          <Badge variant="secondary">{STRATEGY_LABELS[bot.strategy_type]}</Badge>
          <Badge variant="secondary">{bot.market}</Badge>
          <Badge variant={bot.mode === "live" ? "default" : "secondary"}>
            {bot.mode}
          </Badge>
          <BotStatusBadge status={bot.status} reason={bot.status_reason} />
        </div>
        <div className="flex items-center gap-1">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {bot.status === "running" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run("pause")}
            >
              <PauseIcon className="size-4" /> Pause
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(bot.status === "paused" ? "resume" : "start")
              }
            >
              <PlayIcon className="size-4" />
              {bot.status === "paused" ? "Resume" : "Start"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || bot.status === "stopped"}
            onClick={() => void run("flatten")}
          >
            Flatten
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || bot.status === "stopped"}
            onClick={() => void run("stop")}
          >
            <SquareIcon className="size-4" /> Stop
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void router.navigate({ to: "/bots" })}
          >
            Back
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Realized PnL"
          value={`${stats.realized_pnl >= 0 ? "+" : ""}$${stats.realized_pnl.toFixed(2)}`}
          tone={
            stats.realized_pnl > 0
              ? "up"
              : stats.realized_pnl < 0
                ? "down"
                : undefined
          }
        />
        <StatCard
          label="Paper equity"
          value={
            state?.paper_cash !== null && state?.paper_cash !== undefined
              ? `$${state.paper_cash.toFixed(2)} cash`
              : "—"
          }
        />
        <StatCard
          label="Position"
          value={
            state?.paper_position
              ? `${state.paper_position.szi} @ ${state.paper_position.entryPx.toFixed(2)}`
              : "flat"
          }
        />
        <StatCard
          label="Win rate"
          value={
            winRate !== null
              ? `${winRate.toFixed(0)}% (${stats.wins}W/${stats.losses}L, ${stats.trade_count} fills)`
              : `${stats.trade_count} fills`
          }
        />
      </div>

      {notice ? (
        <div
          className={cn(
            "shrink-0 rounded-md border px-3 py-1.5 text-xs",
            notice.tone === "ok"
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.text}
        </div>
      ) : null}

      <ClientOnly
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading bot workspace…
          </div>
        }
      >
        <BotWorkspacePanels
          data={data}
          network={network}
          openOrders={openOrders}
          onNotify={notify}
        />
      </ClientOnly>
    </div>
  )
}

function BotWorkspacePanels({
  data,
  network,
  openOrders,
  onNotify,
}: {
  data: BotDetailResponse
  network: TradingNetwork
  openOrders: BotDetailResponse["open_orders"]
  onNotify: (message: string, tone: "ok" | "error") => void
}) {
  const { bot, state, trades, events } = data
  const [interval, setInterval] = React.useState<CandleInterval>("15m")
  const mids = useAllMids(network)
  const mid = Number(mids[bot.market] ?? 0)

  const priceLines = React.useMemo(
    () => buildBotChartLines(bot.params, state, openOrders),
    [bot.params, state, openOrders]
  )
  const markers = React.useMemo<ChartMarker[]>(
    () =>
      trades.slice(0, 200).map((trade) => ({
        time: new Date(trade.fill_time).getTime(),
        side: trade.side === "buy" ? "buy" : "sell",
      })),
    [trades]
  )

  const outerLayout = usePersistedLayout("bot-detail-vertical")
  const mainLayout = usePersistedLayout("bot-detail-horizontal")

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="min-h-0 flex-1 rounded-md border"
      defaultLayout={outerLayout.defaultLayout}
      onLayoutChanged={outerLayout.onLayoutChanged}
    >
      <ResizablePanel id="main" defaultSize="70%" minSize="30%">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={mainLayout.defaultLayout}
          onLayoutChanged={mainLayout.onLayoutChanged}
        >
          <ResizablePanel id="chart" defaultSize="72%" minSize="40%">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center gap-1 border-b px-2 py-1">
                <span className="mr-2 text-sm font-semibold">{bot.market}</span>
                {CANDLE_INTERVALS.map((candidate) => (
                  <Button
                    key={candidate}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2 text-xs",
                      interval === candidate && "bg-muted"
                    )}
                    onClick={() => setInterval(candidate)}
                  >
                    {candidate}
                  </Button>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <PriceChart
                  network={network}
                  coin={bot.market}
                  interval={interval}
                  priceLines={priceLines}
                  markers={markers}
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="edit" defaultSize="28%" minSize="20%">
            <BotEditPanel
              bot={bot}
              mid={mid}
              running={bot.status === "running"}
              onSaved={onNotify}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="bottom" defaultSize="30%" minSize="12%">
        <Tabs defaultValue="trades" className="flex h-full min-h-0 flex-col gap-0">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="trades"
              className="rounded-none data-[state=active]:bg-muted"
            >
              Trades{trades.length ? ` (${trades.length})` : ""}
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="rounded-none data-[state=active]:bg-muted"
            >
              Open Orders{openOrders.length ? ` (${openOrders.length})` : ""}
            </TabsTrigger>
            <TabsTrigger
              value="events"
              className="rounded-none data-[state=active]:bg-muted"
            >
              Events
            </TabsTrigger>
          </TabsList>
          <TabsContent value="trades" className="min-h-0 flex-1">
            <BotTradesTable trades={trades} />
          </TabsContent>
          <TabsContent value="orders" className="min-h-0 flex-1">
            <BotOrdersTable orders={openOrders} />
          </TabsContent>
          <TabsContent value="events" className="min-h-0 flex-1">
            <BotEventsList events={events} />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function BotTradesTable({
  trades,
}: {
  trades: BotDetailResponse["trades"]
}) {
  if (trades.length === 0) {
    return <EmptyState text="No fills yet." />
  }
  return (
    <ScrollArea className="h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => {
            const pnl = Number(trade.closed_pnl ?? 0)
            return (
              <TableRow key={trade.id}>
                <TableCell className="font-mono text-[11px] tabular-nums">
                  {new Date(trade.fill_time).toLocaleString("en-US", {
                    hour12: false,
                  })}
                </TableCell>
                <TableCell
                  className={cn(
                    trade.side === "buy" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {trade.side}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(trade.px)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {trade.sz}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {Number(trade.fee).toFixed(4)}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    pnl > 0
                      ? "text-emerald-600"
                      : pnl < 0
                        ? "text-red-500"
                        : undefined
                  )}
                >
                  {pnl !== 0 ? pnl.toFixed(2) : "—"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function BotOrdersTable({
  orders,
}: {
  orders: BotDetailResponse["open_orders"]
}) {
  if (orders.length === 0) {
    return <EmptyState text="No resting orders." />
  }
  return (
    <ScrollArea className="h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Side</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell
                className={cn(
                  order.side === "buy" ? "text-emerald-600" : "text-red-500"
                )}
              >
                {order.side}
              </TableCell>
              <TableCell className="font-mono tabular-nums">
                {order.px ? formatPriceDisplay(order.px) : "market"}
              </TableCell>
              <TableCell className="font-mono tabular-nums">{order.sz}</TableCell>
              <TableCell className="font-mono text-[11px]">
                {order.purpose}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {order.status}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function BotEventsList({
  events,
}: {
  events: BotDetailResponse["events"]
}) {
  if (events.length === 0) {
    return <EmptyState text="No events yet." />
  }
  return (
    <ScrollArea className="h-full">
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
    </ScrollArea>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "up" | "down"
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-[10px] text-muted-foreground uppercase">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 font-mono text-sm tabular-nums",
            tone === "up" && "text-emerald-600",
            tone === "down" && "text-red-500"
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

function usePersistedLayout(key: string) {
  const [defaultLayout] = React.useState<Layout | undefined>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Layout) : undefined
    } catch {
      return undefined
    }
  })

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // storage full/blocked — layout just won't persist
      }
    },
    [key]
  )

  return { defaultLayout, onLayoutChanged }
}
