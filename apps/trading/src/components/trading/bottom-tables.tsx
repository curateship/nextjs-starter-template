import * as React from "react"
import type { WebData2WsEvent } from "@nktkas/hyperliquid"
import { Loader2Icon } from "lucide-react"

import { formatPriceDisplay } from "@/components/trading/format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cancelOrder, getOrderErrorMessage, placeOrder } from "@/lib/api/orders"
import { subscribeUserFills } from "@/lib/hl/ws"
import type { TradingNetwork } from "@/lib/hl/network"
import { cn } from "@/lib/utils"

type PositionAction = {
  kind: "close" | "reverse"
  coin: string
  szi: number
}

export function PositionsTable({
  webData,
  walletId,
  mids,
  onDone,
}: {
  webData: WebData2WsEvent | null
  walletId: string | null
  mids: Record<string, string>
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [pending, setPending] = React.useState<PositionAction | null>(null)
  const [busy, setBusy] = React.useState(false)

  const positions = (webData?.clearinghouseState?.assetPositions ?? []).filter(
    ({ position }) => Number(position.szi) !== 0
  )

  async function confirmAction() {
    if (!pending || !walletId) return
    setBusy(true)
    try {
      const closeSide = pending.szi > 0 ? "sell" : "buy"
      const sz =
        pending.kind === "close"
          ? Math.abs(pending.szi)
          : Math.abs(pending.szi) * 2
      await placeOrder({
        walletId,
        market: pending.coin,
        side: closeSide,
        orderType: "market",
        sz: sz.toFixed(8),
        reduceOnly: pending.kind === "close",
        tif: "Ioc",
        leverage: 1,
      })
      onDone(
        pending.kind === "close"
          ? `Closed ${pending.coin} position.`
          : `Reversed ${pending.coin} position.`,
        "ok"
      )
      setPending(null)
    } catch (error) {
      onDone(getOrderErrorMessage(error), "error")
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  if (positions.length === 0) {
    return <EmptyState text="No open positions." />
  }

  return (
    <ScrollArea className={cn("h-full", STICKY_SCROLL_OVERRIDES)}>
      <Table>
        <TableHeader className={STICKY_TABLE_HEADER}>
          <TableRow>
            <TableHead>Market</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Mark</TableHead>
            <TableHead>Liq. price</TableHead>
            <TableHead>uPnL (ROE)</TableHead>
            <TableHead>Margin</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map(({ position }) => {
            const szi = Number(position.szi)
            const upnl = Number(position.unrealizedPnl)
            const roe = Number(position.returnOnEquity) * 100
            return (
              <TableRow key={position.coin}>
                <TableCell className="font-medium">
                  {position.coin}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {position.leverage.value}x {position.leverage.type}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    szi > 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {position.szi}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(position.entryPx ?? "0")}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(mids[position.coin] ?? "0")}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {position.liquidationPx
                    ? formatPriceDisplay(position.liquidationPx)
                    : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    upnl >= 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {upnl >= 0 ? "+" : ""}
                  {upnl.toFixed(2)} ({roe.toFixed(1)}%)
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  ${Number(position.marginUsed).toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={!walletId}
                      onClick={() =>
                        setPending({ kind: "close", coin: position.coin, szi })
                      }
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={!walletId}
                      onClick={() =>
                        setPending({
                          kind: "reverse",
                          coin: position.coin,
                          szi,
                        })
                      }
                    >
                      Reverse
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "close" ? "Close" : "Reverse"} {pending?.coin}{" "}
              position
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "close"
                ? "Sends a reduce-only market order for the full position size."
                : "Sends a market order for twice the position size, flipping the direction."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Position: <span className="font-mono">{pending?.szi}</span>{" "}
              {pending?.coin}
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmAction()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Confirm
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}

export function OpenOrdersTable({
  webData,
  walletId,
  onDone,
}: {
  webData: WebData2WsEvent | null
  walletId: string | null
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [cancelling, setCancelling] = React.useState<number | null>(null)
  const orders = webData?.openOrders ?? []

  async function cancel(coin: string, oid: number) {
    if (!walletId) return
    setCancelling(oid)
    try {
      await cancelOrder({ walletId, market: coin, oid })
      onDone(`Cancelled order #${oid}.`, "ok")
    } catch (error) {
      onDone(getOrderErrorMessage(error), "error")
    } finally {
      setCancelling(null)
    }
  }

  if (orders.length === 0) {
    return <EmptyState text="No open orders." />
  }

  return (
    <ScrollArea className={cn("h-full", STICKY_SCROLL_OVERRIDES)}>
      <Table>
        <TableHeader className={STICKY_TABLE_HEADER}>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Filled</TableHead>
            <TableHead>Reduce</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const filled = Number(order.origSz) - Number(order.sz)
            return (
              <TableRow key={order.oid}>
                <TableCell className="font-mono text-[11px] tabular-nums">
                  {new Date(order.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                  })}
                </TableCell>
                <TableCell className="font-medium">{order.coin}</TableCell>
                <TableCell
                  className={cn(
                    order.side === "B" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {order.side === "B" ? "Buy" : "Sell"}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(order.limitPx)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {order.origSz}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {filled > 0 ? filled.toFixed(4) : "—"}
                </TableCell>
                <TableCell>{order.reduceOnly ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={!walletId || cancelling === order.oid}
                    onClick={() => void cancel(order.coin, order.oid)}
                  >
                    {cancelling === order.oid ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : null}
                    Cancel
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

type FillRow = {
  tid: number
  coin: string
  side: "B" | "A"
  px: string
  sz: string
  fee: string
  closedPnl: string
  dir: string
  time: number
}

export function FillsTable({
  network,
  address,
}: {
  network: TradingNetwork
  address: string | null
}) {
  const key = `${network}:${address ?? ""}`
  const [state, setState] = React.useState<{
    key: string
    fills: FillRow[]
  } | null>(null)

  React.useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return
    return subscribeUserFills(network, address as `0x${string}`, (event) => {
      setState((prev) => {
        const current =
          prev?.key === key && !event.isSnapshot ? prev.fills : []
        const merged = [...event.fills, ...current]
        const seen = new Set<number>()
        return {
          key,
          fills: merged
            .filter((fill) => {
              if (seen.has(fill.tid)) return false
              seen.add(fill.tid)
              return true
            })
            .sort((a, b) => b.time - a.time)
            .slice(0, 100),
        }
      })
    })
  }, [network, address, key])

  const fills = state?.key === key ? state.fills : []

  if (!address) {
    return <EmptyState text="Select a wallet to see fills." />
  }
  if (fills.length === 0) {
    return <EmptyState text="No fills yet." />
  }

  return (
    <ScrollArea className={cn("h-full", STICKY_SCROLL_OVERRIDES)}>
      <Table>
        <TableHeader className={STICKY_TABLE_HEADER}>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Closed PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fills.map((fill) => {
            const closedPnl = Number(fill.closedPnl)
            return (
              <TableRow key={fill.tid}>
                <TableCell className="font-mono text-[11px] tabular-nums">
                  {new Date(fill.time).toLocaleString("en-US", {
                    hour12: false,
                  })}
                </TableCell>
                <TableCell className="font-medium">{fill.coin}</TableCell>
                <TableCell
                  className={cn(
                    fill.side === "B" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {fill.dir}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(fill.px)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {fill.sz}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {Number(fill.fee).toFixed(4)}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    closedPnl > 0
                      ? "text-emerald-600"
                      : closedPnl < 0
                        ? "text-red-500"
                        : undefined
                  )}
                >
                  {closedPnl !== 0 ? closedPnl.toFixed(2) : "—"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}
