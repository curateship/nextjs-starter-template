import * as React from "react"

import { formatPrice, signedUsd, usd } from "@/lib/format"
import {
  ClosedPnlCell,
  EmptyState,
  MonoCell,
  RowActionButton,
  SideCell,
  StickyTable,
  TimeCell,
} from "@/components/trading/table-bits"
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog"
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
  onSelectMarket,
}: {
  account: PaperAccountResponse | null
  confirmationEnabled: boolean
  onDone: (message: string, tone: "ok" | "error") => void
  /** Clicking a position row switches the workspace to that market. */
  onSelectMarket?: (coin: string) => void
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
    return <EmptyState
        text="No open paper positions."
        hint="Practice orders fill against live prices without risking money."
      />
  }

  return (
    <>
      <StickyTable headers={["Market", "Size", "uPnL", "Actions"]}>
        {positions.map((position) => {
          const szi = Number(position.szi)
          return (
            <TableRow
              key={position.coin}
              onClick={
                onSelectMarket
                  ? () => onSelectMarket(position.coin)
                  : undefined
              }
            >
              <TableCell className="font-medium">{position.coin}</TableCell>
              {/* Dollars, matching the live positions table. */}
              <MonoCell
                className={szi > 0 ? "text-emerald-600" : "text-red-500"}
              >
                {usd(szi * Number(position.mark_px))}
              </MonoCell>
              <MonoCell
                className={
                  position.unrealized_pnl >= 0
                    ? "text-emerald-600"
                    : "text-red-500"
                }
              >
                {signedUsd(position.unrealized_pnl)}
              </MonoCell>
              {/* Row actions must not also trigger the row's market switch. */}
              <TableCell onClick={(event) => event.stopPropagation()}>
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

      <ConfirmActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={`Close your ${pending?.coin} paper position?`}
        consequence={
          pending
            ? `Places a practice market order right now to ${
                pending.szi > 0 ? "sell" : "buy back"
              } your whole position of ${Math.abs(pending.szi)} ${
                pending.coin
              } at the current price.`
            : ""
        }
        confirmLabel="Close position"
        busy={closing !== null}
        confirmDisabled={!pending}
        onConfirm={() =>
          pending && void closePosition(pending.coin, pending.szi)
        }
      />
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
    return <EmptyState
        text="No open paper orders."
        hint="Resting practice orders wait here until they fill or are cancelled."
      />
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
          <MonoCell>{order.px ? formatPrice(order.px) : "market"}</MonoCell>
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
    return <EmptyState
        text="No paper fills yet."
        hint="Every executed practice trade lands here with its price and fee."
      />
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
          <MonoCell>{formatPrice(fill.px)}</MonoCell>
          <MonoCell>{fill.sz}</MonoCell>
          <MonoCell>{Number(fill.fee).toFixed(4)}</MonoCell>
          <ClosedPnlCell value={Number(fill.closed_pnl)} />
        </TableRow>
      ))}
    </StickyTable>
  )
}
