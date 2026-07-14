import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { formatPriceDisplay } from "@/components/trading/format"
import {
  ClosedPnlCell,
  EmptyState,
  MonoCell,
  RowActionButton,
  SideCell,
  StickyTable,
  TimeCell,
} from "@/components/trading/table-bits"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  cancelPaperOrder,
  getPaperErrorMessage,
  placePaperOrder,
  type PaperAccountResponse,
} from "@/lib/api/paper"

export function PaperPositionsTable({
  account,
  confirmationEnabled,
  onDone,
}: {
  account: PaperAccountResponse | null
  confirmationEnabled: boolean
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [closing, setClosing] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<{
    coin: string
    szi: number
  } | null>(null)
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
      setPending(null)
    } catch (error) {
      onDone(getPaperErrorMessage(error), "error")
    } finally {
      setClosing(null)
    }
  }

  function requestClose(coin: string, szi: number) {
    if (confirmationEnabled) {
      setPending({ coin, szi })
      return
    }
    void closePosition(coin, szi)
  }

  if (positions.length === 0) {
    return <EmptyState text="No open paper positions." />
  }

  return (
    <>
      <StickyTable
        headers={["Market", "Size", "Entry", "Mark", "uPnL", "Actions"]}
      >
        {positions.map((position) => {
          const szi = Number(position.szi)
          return (
            <TableRow key={position.coin}>
              <TableCell className="font-medium">{position.coin}</TableCell>
              <MonoCell
                className={szi > 0 ? "text-emerald-600" : "text-red-500"}
              >
                {position.szi}
              </MonoCell>
              <MonoCell>{formatPriceDisplay(position.entry_px)}</MonoCell>
              <MonoCell>{formatPriceDisplay(position.mark_px)}</MonoCell>
              <MonoCell
                className={
                  position.unrealized_pnl >= 0
                    ? "text-emerald-600"
                    : "text-red-500"
                }
              >
                {position.unrealized_pnl >= 0 ? "+" : ""}
                {position.unrealized_pnl.toFixed(2)}
              </MonoCell>
              <TableCell>
                <RowActionButton
                  busy={closing === position.coin}
                  disabled={closing !== null}
                  onClick={() => requestClose(position.coin, szi)}
                >
                  Close
                </RowActionButton>
              </TableCell>
            </TableRow>
          )
        })}
      </StickyTable>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Close {pending?.coin} paper position?</DialogTitle>
            <DialogDescription>
              This sends a market order for the full position size.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={closing !== null}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!pending || closing !== null}
              onClick={() =>
                pending && void closePosition(pending.coin, pending.szi)
              }
            >
              {closing ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    <StickyTable
      headers={["Time", "Market", "Side", "Price", "Size", "Status", "Actions"]}
    >
      {orders.map((order) => (
        <TableRow key={order.id}>
          <TimeCell time={order.created_at} />
          <TableCell className="font-medium">{order.coin}</TableCell>
          <SideCell isBuy={order.side === "buy"}>{order.side}</SideCell>
          <MonoCell>{order.px ? formatPriceDisplay(order.px) : "market"}</MonoCell>
          <MonoCell>{order.sz}</MonoCell>
          <TableCell className="text-xs text-muted-foreground">
            {order.status}
          </TableCell>
          <TableCell>
            <RowActionButton
              busy={cancelling === order.id}
              disabled={cancelling === order.id || order.status === "cancelling"}
              onClick={() => void cancel(order.id)}
            >
              Cancel
            </RowActionButton>
          </TableCell>
        </TableRow>
      ))}
    </StickyTable>
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
    <StickyTable
      headers={["Time", "Market", "Side", "Price", "Size", "Fee", "Closed PnL"]}
    >
      {fills.map((fill) => (
        <TableRow key={fill.id}>
          <TimeCell time={fill.fill_time} full />
          <TableCell className="font-medium">{fill.coin}</TableCell>
          <SideCell isBuy={fill.side === "buy"}>{fill.side}</SideCell>
          <MonoCell>{formatPriceDisplay(fill.px)}</MonoCell>
          <MonoCell>{fill.sz}</MonoCell>
          <MonoCell>{Number(fill.fee).toFixed(4)}</MonoCell>
          <ClosedPnlCell value={Number(fill.closed_pnl)} />
        </TableRow>
      ))}
    </StickyTable>
  )
}
