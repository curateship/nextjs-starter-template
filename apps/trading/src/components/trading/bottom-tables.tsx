import * as React from "react"
import { useUserFills, type AccountSnapshot } from "@/lib/hl/hooks"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  cancelOrder,
  getOrderErrorMessage,
  modifyOrder,
  placeOrder,
  setPositionTpsl,
} from "@/lib/api/orders"
import { resolveTakeProfitPrice } from "@/lib/one-click-order"
import type { TradingNetwork } from "@/lib/hl/network"
import {
  liquidationDistanceClass,
  liquidationDistancePct,
} from "@/lib/trading/liquidation-risk"
import {
  describeOpenOrder,
  type FrontendOpenOrder,
} from "@/lib/trading/open-order"

type PositionAction = {
  kind: "close" | "reverse"
  coin: string
  szi: number
}

/** Resolved trigger price for a typed percent, so the number is never a guess. */
function PricePreview({
  label,
  price,
}: {
  label: string
  price: number | null
}) {
  if (price === null) return null
  return (
    <p className="text-[11px] text-muted-foreground">
      {label}{" "}
      <span className="font-mono">{formatPriceDisplay(String(price))}</span>
    </p>
  )
}

export function PositionsTable({
  account,
  walletId,
  mids,
  confirmationEnabled,
  onDone,
  onSelectMarket,
}: {
  account: AccountSnapshot | null
  walletId: string | null
  mids: Record<string, string>
  confirmationEnabled: boolean
  onDone: (message: string, tone: "ok" | "error") => void
  /** Clicking a position row switches the workspace to that market. */
  onSelectMarket?: (coin: string) => void
}) {
  const [pending, setPending] = React.useState<PositionAction | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Stop-loss / take-profit editor for an already-open position.
  const [protecting, setProtecting] = React.useState<{
    coin: string
    szi: number
    entryPx: number
  } | null>(null)
  const [protectForm, setProtectForm] = React.useState({ sl: "", tp: "" })
  const [protectBusy, setProtectBusy] = React.useState(false)
  const [protectError, setProtectError] = React.useState<string | null>(null)

  const positions = (account?.clearinghouseState?.assetPositions ?? []).filter(
    ({ position }) => Number(position.szi) !== 0
  )

  // Show where each percent actually lands, using the same math the server
  // applies, so the price is never a surprise.
  const protectPreview = React.useMemo(() => {
    if (!protecting || !(protecting.entryPx > 0)) return { sl: null, tp: null }
    const isLong = protecting.szi > 0
    const markRaw = Number(mids[protecting.coin] ?? 0)
    const mark = markRaw > 0 ? markRaw : protecting.entryPx
    const slPct = Number(protectForm.sl)
    const tpPct = Number(protectForm.tp)
    return {
      sl:
        protectForm.sl.trim() !== "" && slPct > 0
          ? protecting.entryPx *
            (isLong ? 1 - slPct / 100 : 1 + slPct / 100)
          : null,
      tp:
        protectForm.tp.trim() !== "" && tpPct > 0
          ? resolveTakeProfitPrice({
              entryPrice: protecting.entryPx,
              currentPrice: mark,
              side: isLong ? "buy" : "sell",
              takeProfitPct: tpPct,
            })
          : null,
    }
  }, [protecting, protectForm, mids])

  function openProtect(coin: string, szi: number, entryPx: number) {
    setProtectForm({ sl: "", tp: "" })
    setProtectError(null)
    setProtecting({ coin, szi, entryPx })
  }

  async function submitProtect() {
    if (!walletId || !protecting) return
    const sl = Number(protectForm.sl.trim())
    const tp = Number(protectForm.tp.trim())
    const hasSl = protectForm.sl.trim() !== "" && sl > 0
    const hasTp = protectForm.tp.trim() !== "" && tp > 0
    if (!hasSl && !hasTp) {
      setProtectError("Enter a stop-loss or take-profit percent.")
      return
    }
    setProtectBusy(true)
    setProtectError(null)
    try {
      const result = await setPositionTpsl({
        walletId,
        market: protecting.coin,
        ...(hasSl ? { stopLossPct: sl } : {}),
        ...(hasTp ? { takeProfitPct: tp } : {}),
      })
      const parts = [
        result.stopLossPx ? `stop ${result.stopLossPx}` : null,
        result.takeProfitPx ? `take-profit ${result.takeProfitPx}` : null,
      ].filter(Boolean)
      onDone(
        `Protecting ${result.sz} ${protecting.coin} — ${parts.join(", ")}.`,
        "ok"
      )
      setProtecting(null)
    } catch (error) {
      setProtectError(getOrderErrorMessage(error))
    } finally {
      setProtectBusy(false)
    }
  }

  async function submitAction(action: PositionAction) {
    if (!walletId) return
    setBusy(true)
    try {
      const closeSide = action.szi > 0 ? "sell" : "buy"
      const sz =
        action.kind === "close"
          ? Math.abs(action.szi)
          : Math.abs(action.szi) * 2
      await placeOrder({
        walletId,
        market: action.coin,
        side: closeSide,
        orderType: "market",
        sz: sz.toFixed(8),
        reduceOnly: action.kind === "close",
        tif: "Ioc",
        leverage: 1,
      })
      onDone(
        action.kind === "close"
          ? `Closed ${action.coin} position.`
          : `Reversed ${action.coin} position.`,
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

  function requestAction(action: PositionAction) {
    if (confirmationEnabled) {
      setPending(action)
      return
    }
    void submitAction(action)
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
          "Liq. distance",
          "uPnL (ROE)",
          "Margin",
          "Actions",
        ]}
      >
        {positions.map(({ position }) => {
          const szi = Number(position.szi)
          const upnl = Number(position.unrealizedPnl)
          const roe = Number(position.returnOnEquity) * 100
          // Gap between mark and forced liquidation, graded by how close it is.
          const liqDistance = liquidationDistancePct({
            szi,
            markPx: Number(mids[position.coin] ?? 0),
            liquidationPx: position.liquidationPx
              ? Number(position.liquidationPx)
              : null,
          })
          return (
            <TableRow
              key={position.coin}
              onClick={
                onSelectMarket
                  ? () => onSelectMarket(position.coin)
                  : undefined
              }
            >
              <TableCell className="font-medium">
                {position.coin}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {position.leverage.value}x {position.leverage.type}
                </span>
              </TableCell>
              {/* Dollars, not coins: the exchange's own notional, signed so a
                  short still reads as negative alongside the color. */}
              <MonoCell className={szi > 0 ? "text-emerald-600" : "text-red-500"}>
                {szi < 0 ? "-" : ""}$
                {Math.abs(Number(position.positionValue)).toFixed(2)}
              </MonoCell>
              <MonoCell className={liquidationDistanceClass(liqDistance)}>
                {liqDistance === null ? "—" : `${liqDistance.toFixed(1)}%`}
              </MonoCell>
              <MonoCell className={upnl >= 0 ? "text-emerald-600" : "text-red-500"}>
                {upnl >= 0 ? "+" : ""}
                {upnl.toFixed(2)} ({roe.toFixed(1)}%)
              </MonoCell>
              <MonoCell>${Number(position.marginUsed).toFixed(2)}</MonoCell>
              <TableCell>
                {/* Row actions must not also trigger the row's market switch. */}
                <div
                  className="flex gap-1"
                  onClick={(event) => event.stopPropagation()}
                >
                  <RowActionButton
                    disabled={!walletId || busy}
                    onClick={() =>
                      requestAction({ kind: "close", coin: position.coin, szi })
                    }
                  >
                    Close
                  </RowActionButton>
                  <RowActionButton
                    disabled={!walletId || busy}
                    onClick={() =>
                      requestAction({ kind: "reverse", coin: position.coin, szi })
                    }
                  >
                    Reverse
                  </RowActionButton>
                  <RowActionButton
                    disabled={!walletId || busy}
                    onClick={() =>
                      openProtect(
                        position.coin,
                        szi,
                        Number(position.entryPx ?? 0)
                      )
                    }
                  >
                    TP/SL
                  </RowActionButton>
                </div>
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
        title={`${pending?.kind === "close" ? "Close" : "Reverse"} your ${
          pending?.coin
        } position?`}
        consequence={
          pending
            ? pending.kind === "close"
              ? `Places a market order right now to ${
                  pending.szi > 0 ? "sell" : "buy back"
                } your whole position of ${Math.abs(pending.szi)} ${
                  pending.coin
                } at the current price.`
              : `Places a market order right now for twice your position size — it closes your ${Math.abs(
                  pending.szi
                )} ${pending.coin} ${
                  pending.szi > 0 ? "long" : "short"
                } and opens an equal ${
                  pending.szi > 0 ? "short" : "long"
                }, flipping your bet to the opposite direction.`
            : ""
        }
        confirmLabel={
          pending?.kind === "close" ? "Close position" : "Reverse position"
        }
        busy={busy}
        onConfirm={() => pending && void submitAction(pending)}
      />

      <Dialog
        open={Boolean(protecting)}
        onOpenChange={(open) => {
          if (!open && !protectBusy) setProtecting(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Stop-loss / take-profit for {protecting?.coin}
            </DialogTitle>
            <DialogDescription>
              Percent from your entry price ({
                protecting ? formatPriceDisplay(String(protecting.entryPx)) : "—"
              }). Protects your whole {protecting?.coin} position and keeps
              covering it if you add to it later. Fill in one or both.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid gap-1">
                    <Label htmlFor="position-tp">Take-profit %</Label>
                    <Input
                      id="position-tp"
                      inputMode="decimal"
                      placeholder="Enter % for TP"
                      value={protectForm.tp}
                      onChange={(event) =>
                        setProtectForm((current) => ({
                          ...current,
                          tp: event.target.value,
                        }))
                      }
                    />
                    <PricePreview
                      label="Takes profit at"
                      price={protectPreview.tp}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="position-sl">Stop-loss %</Label>
                    <Input
                      id="position-sl"
                      inputMode="decimal"
                      placeholder="Enter % for SL"
                      value={protectForm.sl}
                      onChange={(event) =>
                        setProtectForm((current) => ({
                          ...current,
                          sl: event.target.value,
                        }))
                      }
                    />
                    <PricePreview label="Stops out at" price={protectPreview.sl} />
                  </div>
                  {protectError ? (
                    <p className="text-xs text-destructive">{protectError}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={protectBusy}
                onClick={() => setProtecting(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={protectBusy}
                onClick={() => void submitProtect()}
              >
                {protectBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Set protection
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
  requestedEditOrder,
  onEditOrderHandled,
}: {
  account: AccountSnapshot | null
  walletId: string | null
  onDone: (message: string, tone: "ok" | "error") => void
  requestedEditOrder?: FrontendOpenOrder | null
  onEditOrderHandled?: () => void
}) {
  const [cancelling, setCancelling] = React.useState<number | null>(null)
  const [editing, setEditing] = React.useState<FrontendOpenOrder | null>(null)
  const orderValueRef = React.useRef<HTMLInputElement>(null)
  const [modifying, setModifying] = React.useState(false)
  const orders = account?.openOrders ?? []
  const editOrder = editing ?? requestedEditOrder
  const editDescription = editOrder ? describeOpenOrder(editOrder) : null

  function closeSizeEdit() {
    setEditing(null)
    onEditOrderHandled?.()
  }

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

  async function saveSize() {
    if (!walletId || !editOrder || !editDescription) return
    const orderValueUsd = orderValueRef.current?.value ?? ""
    setModifying(true)
    try {
      const sz = (
        Number(orderValueUsd) / Number(editDescription.price)
      ).toFixed(8)
      const result = await modifyOrder({
        walletId,
        market: editOrder.coin,
        oid: editOrder.oid,
        px: editDescription.price,
        sz,
      })
      onDone(
        `Order #${editOrder.oid} size changed to ${orderValueUsd} USDC (${result.sz} ${editOrder.coin}).`,
        "ok"
      )
      closeSizeEdit()
    } catch (error) {
      onDone(getOrderErrorMessage(error), "error")
    } finally {
      setModifying(false)
    }
  }

  return (
    <>
      {orders.length === 0 ? (
        <EmptyState text="No open orders." />
      ) : (
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
            const description = describeOpenOrder(order)
            return (
              <TableRow key={order.oid}>
                <TimeCell time={order.timestamp} />
                <TableCell className="font-medium">{order.coin}</TableCell>
                <SideCell isBuy={order.side === "B"}>
                  {description.label}
                </SideCell>
                <MonoCell>{formatPriceDisplay(description.price)}</MonoCell>
                <MonoCell>{order.origSz}</MonoCell>
                <MonoCell>{filled > 0 ? filled.toFixed(4) : "—"}</MonoCell>
                <TableCell>{order.reduceOnly ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <RowActionButton
                      disabled={!walletId}
                      onClick={() => setEditing(order)}
                    >
                      Edit size
                    </RowActionButton>
                    <RowActionButton
                      busy={cancelling === order.oid}
                      disabled={!walletId || cancelling === order.oid}
                      onClick={() => void cancel(order.coin, order.oid)}
                    >
                      Cancel
                    </RowActionButton>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </StickyTable>
      )}

      <Dialog
        open={Boolean(editOrder)}
        onOpenChange={(open) => {
          if (!open && !modifying) closeSizeEdit()
        }}
      >
        <DialogContent variant="admin">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void saveSize()
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit {editOrder?.coin} order size</DialogTitle>
              <DialogDescription>
                Change the USDC value still waiting to be filled.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Order size</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="edit-order-size">Order value (USDC)</Label>
                  <Input
                    key={editOrder?.oid}
                    ref={orderValueRef}
                    id="edit-order-size"
                    autoFocus
                    inputMode="decimal"
                    defaultValue={
                      editOrder && editDescription
                        ? (
                            Number(editOrder.sz) * Number(editDescription.price)
                          ).toFixed(2)
                        : ""
                    }
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter variant="plain">
              <Button
                type="button"
                variant="outline"
                disabled={modifying}
                onClick={closeSizeEdit}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={modifying}>
                {modifying ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Save size
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function FillsTable({
  network,
  address,
}: {
  network: TradingNetwork
  address: string | null
}) {
  const fills = useUserFills(network, address)

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
