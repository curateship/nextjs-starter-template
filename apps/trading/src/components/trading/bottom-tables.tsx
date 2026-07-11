import * as React from "react"
import type { AccountSnapshot } from "@/lib/hl/hooks"
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { cancelOrder, getOrderErrorMessage, placeOrder } from "@/lib/api/orders"
import { subscribeUserFills } from "@/lib/hl/ws"
import type { TradingNetwork } from "@/lib/hl/network"

type PositionAction = {
  kind: "close" | "reverse"
  coin: string
  szi: number
}

export function PositionsTable({
  account,
  walletId,
  mids,
  onDone,
}: {
  account: AccountSnapshot | null
  walletId: string | null
  mids: Record<string, string>
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [pending, setPending] = React.useState<PositionAction | null>(null)
  const [busy, setBusy] = React.useState(false)

  const positions = (account?.clearinghouseState?.assetPositions ?? []).filter(
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
    <>
      <StickyTable
        headers={[
          "Market",
          "Size",
          "Entry",
          "Mark",
          "Liq. price",
          "uPnL (ROE)",
          "Margin",
          "Actions",
        ]}
      >
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
              <MonoCell className={szi > 0 ? "text-emerald-600" : "text-red-500"}>
                {position.szi}
              </MonoCell>
              <MonoCell>{formatPriceDisplay(position.entryPx ?? "0")}</MonoCell>
              <MonoCell>{formatPriceDisplay(mids[position.coin] ?? "0")}</MonoCell>
              <MonoCell>
                {position.liquidationPx
                  ? formatPriceDisplay(position.liquidationPx)
                  : "—"}
              </MonoCell>
              <MonoCell className={upnl >= 0 ? "text-emerald-600" : "text-red-500"}>
                {upnl >= 0 ? "+" : ""}
                {upnl.toFixed(2)} ({roe.toFixed(1)}%)
              </MonoCell>
              <MonoCell>${Number(position.marginUsed).toFixed(2)}</MonoCell>
              <TableCell>
                <div className="flex gap-1">
                  <RowActionButton
                    disabled={!walletId}
                    onClick={() =>
                      setPending({ kind: "close", coin: position.coin, szi })
                    }
                  >
                    Close
                  </RowActionButton>
                  <RowActionButton
                    disabled={!walletId}
                    onClick={() =>
                      setPending({ kind: "reverse", coin: position.coin, szi })
                    }
                  >
                    Reverse
                  </RowActionButton>
                </div>
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
    </>
  )
}

export function OpenOrdersTable({
  account,
  walletId,
  onDone,
}: {
  account: AccountSnapshot | null
  walletId: string | null
  onDone: (message: string, tone: "ok" | "error") => void
}) {
  const [cancelling, setCancelling] = React.useState<number | null>(null)
  const orders = account?.openOrders ?? []

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
    <StickyTable
      headers={[
        "Time",
        "Market",
        "Side",
        "Price",
        "Size",
        "Filled",
        "Reduce",
        "Actions",
      ]}
    >
      {orders.map((order) => {
        const filled = Number(order.origSz) - Number(order.sz)
        return (
          <TableRow key={order.oid}>
            <TimeCell time={order.timestamp} />
            <TableCell className="font-medium">{order.coin}</TableCell>
            <SideCell isBuy={order.side === "B"}>
              {order.side === "B" ? "Buy" : "Sell"}
            </SideCell>
            <MonoCell>{formatPriceDisplay(order.limitPx)}</MonoCell>
            <MonoCell>{order.origSz}</MonoCell>
            <MonoCell>{filled > 0 ? filled.toFixed(4) : "—"}</MonoCell>
            <TableCell>{order.reduceOnly ? "Yes" : "No"}</TableCell>
            <TableCell>
              <RowActionButton
                busy={cancelling === order.oid}
                disabled={!walletId || cancelling === order.oid}
                onClick={() => void cancel(order.coin, order.oid)}
              >
                Cancel
              </RowActionButton>
            </TableCell>
          </TableRow>
        )
      })}
    </StickyTable>
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
    <StickyTable
      headers={["Time", "Market", "Direction", "Price", "Size", "Fee", "Closed PnL"]}
    >
      {fills.map((fill) => (
        <TableRow key={fill.tid}>
          <TimeCell time={fill.time} full />
          <TableCell className="font-medium">{fill.coin}</TableCell>
          <SideCell isBuy={fill.side === "B"}>{fill.dir}</SideCell>
          <MonoCell>{formatPriceDisplay(fill.px)}</MonoCell>
          <MonoCell>{fill.sz}</MonoCell>
          <MonoCell>{Number(fill.fee).toFixed(4)}</MonoCell>
          <ClosedPnlCell value={Number(fill.closedPnl)} />
        </TableRow>
      ))}
    </StickyTable>
  )
}
