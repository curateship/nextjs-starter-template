import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { formatPriceDisplay } from "@/components/trading/format"
import { Button } from "@/components/ui/button"
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
import {
  cancelPaperOrder,
  getPaperErrorMessage,
  placePaperOrder,
  type PaperAccountResponse,
} from "@/lib/api/paper"
import { cn } from "@/lib/utils"

export function PaperPositionsTable({
  account,
  onDone,
}: {
  account: PaperAccountResponse | null
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [closing, setClosing] = React.useState<string | null>(null)
  const positions = account?.positions ?? []

  async function closePosition(coin: string, szi: number) {
    if (!account) return
    setClosing(coin)
    try {
      await placePaperOrder({
        paperWalletId: account.wallet.id,
        coin,
        side: szi > 0 ? "sell" : "buy",
        orderType: "market",
        sz: String(Math.abs(szi)),
        tif: "Ioc",
        reduceOnly: true,
      })
      onDone(`Closing ${coin} paper position.`, "ok")
    } catch (error) {
      onDone(getPaperErrorMessage(error), "error")
    } finally {
      setClosing(null)
    }
  }

  if (positions.length === 0) {
    return <EmptyState text="No open paper positions." />
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
            <TableHead>uPnL</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => {
            const szi = Number(position.szi)
            return (
              <TableRow key={position.coin}>
                <TableCell className="font-medium">{position.coin}</TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    szi > 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {position.szi}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(position.entry_px)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(position.mark_px)}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono tabular-nums",
                    position.unrealized_pnl >= 0
                      ? "text-emerald-600"
                      : "text-red-500"
                  )}
                >
                  {position.unrealized_pnl >= 0 ? "+" : ""}
                  {position.unrealized_pnl.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={closing === position.coin}
                    onClick={() => void closePosition(position.coin, szi)}
                  >
                    {closing === position.coin ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : null}
                    Close
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

export function PaperOpenOrdersTable({
  account,
  onDone,
}: {
  account: PaperAccountResponse | null
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [cancelling, setCancelling] = React.useState<string | null>(null)
  const orders = account?.openOrders ?? []

  async function cancel(orderId: string) {
    if (!account) return
    setCancelling(orderId)
    try {
      await cancelPaperOrder(account.wallet.id, orderId)
      onDone("Paper order cancelled.", "ok")
    } catch (error) {
      onDone(getPaperErrorMessage(error), "error")
    } finally {
      setCancelling(null)
    }
  }

  if (orders.length === 0) {
    return <EmptyState text="No open paper orders." />
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
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-[11px] tabular-nums">
                {new Date(order.created_at).toLocaleTimeString("en-US", {
                  hour12: false,
                })}
              </TableCell>
              <TableCell className="font-medium">{order.coin}</TableCell>
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
              <TableCell className="text-xs text-muted-foreground">
                {order.status}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={cancelling === order.id || order.status === "cancelling"}
                  onClick={() => void cancel(order.id)}
                >
                  {cancelling === order.id ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : null}
                  Cancel
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

export function PaperFillsTable({
  account,
}: {
  account: PaperAccountResponse | null
}) {
  const fills = account?.fills ?? []
  if (fills.length === 0) {
    return <EmptyState text="No paper fills yet." />
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
            <TableHead>Fee</TableHead>
            <TableHead>Closed PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fills.map((fill) => {
            const closedPnl = Number(fill.closed_pnl)
            return (
              <TableRow key={fill.id}>
                <TableCell className="font-mono text-[11px] tabular-nums">
                  {new Date(fill.fill_time).toLocaleString("en-US", {
                    hour12: false,
                  })}
                </TableCell>
                <TableCell className="font-medium">{fill.coin}</TableCell>
                <TableCell
                  className={cn(
                    fill.side === "buy" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {fill.side}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatPriceDisplay(fill.px)}
                </TableCell>
                <TableCell className="font-mono tabular-nums">{fill.sz}</TableCell>
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
