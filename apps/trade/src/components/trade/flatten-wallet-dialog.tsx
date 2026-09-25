import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Loader2Icon } from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { positionValue, type TradePosition } from "@/lib/trade/paper"
import {
  laddersAndGridsYouPlaced,
  type SmartOrder,
} from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"

/**
 * The question asked before a wallet is emptied.
 *
 * **It counts what goes before it goes**, in dollars, the same way the
 * stand-everything-down confirm does. A press that sells four coins and calls
 * two ladders off is not one anybody should make from a button's label alone.
 *
 * **It says which of the two roads each half takes**, because they are
 * different and the difference costs money. The ladders come off first, and
 * they lose their plan. Then each position is sold with a limit that follows
 * the price rather than a market order, so the press does not mean "out this
 * second" — "Close all" in the bottom panel still means that.
 *
 * Its own component, so `useLiveMarks` only subscribes while the window is
 * open. Subscribed from the wallet panel it would redraw every card on every
 * tick of every coin the wallet holds.
 */
export function FlattenWalletDialog({
  wallet,
  positions,
  smartOrders,
  busy,
  onConfirm,
  onDismiss,
}: {
  /** Null keeps the window closed. */
  wallet: TradeWallet | null
  /** Every position on every wallet — this one's are picked out here. */
  positions: readonly TradePosition[]
  smartOrders: readonly SmartOrder[]
  busy: boolean
  onConfirm: (wallet: TradeWallet) => void
  onDismiss: () => void
}) {
  const mine = positions.filter((one) => one.walletId === wallet?.id)
  const working = laddersAndGridsYouPlaced(smartOrders).filter(
    (one) => one.walletId === wallet?.id
  )
  const empty = mine.length === 0 && working.length === 0
  const emptyReason = `${wallet?.label ?? "This wallet"} holds nothing and has nothing waiting, so there is nothing to empty.`
  return (
    <Dialog
      open={wallet !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onDismiss()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            {wallet ? `Empty ${wallet.label}?` : "Empty this wallet?"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {empty ? (
              emptyReason
            ) : wallet ? (
              <FlattenWording
                wallet={wallet}
                positions={mine}
                smartOrders={working}
              />
            ) : null}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onDismiss}
          >
            Cancel
          </Button>
          <DisabledReason disabled={empty} reason={emptyReason}>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || empty}
              onClick={() => {
                if (wallet && !busy && !empty) onConfirm(wallet)
              }}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Empty the wallet
            </Button>
          </DisabledReason>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FlattenWording({
  wallet,
  positions,
  smartOrders,
}: {
  wallet: TradeWallet
  positions: readonly TradePosition[]
  smartOrders: readonly SmartOrder[]
}) {
  const mine = positions
  const working = smartOrders
  const marks = useLiveMarks(mine.map((one) => one.marketKey))
  const worth = mine.reduce(
    (total, one) =>
      total + positionValue(one, marks.get(one.marketKey) ?? one.entryPx),
    0
  )
  const real = wallet.kind === "live"

  const held =
    mine.length === 0
      ? "Nothing is held"
      : `${mine.length === 1 ? "1 position" : `${mine.length} positions`} worth ${formatUsd(worth)}`
  const waiting =
    working.length === 0
      ? "nothing is waiting"
      : countedWords(
          working.filter((one) => one.kind === "dca").length,
          working.filter((one) => one.kind === "grid").length
        )

  return (
    <>
      {held} and {waiting}.{" "}
      {working.length > 0
        ? "The ladders and grids are called off first and lose their plan — what they bought stays, with its stop under it. Then each"
        : "Each"}{" "}
      position is sold with a limit that follows the price and never pays the
      spread, so it fills when the market comes to it rather than straight away.{" "}
      {real
        ? "This is real money, and it cannot be undone. "
        : "This cannot be undone. "}
      {working.length > 0
        ? "If a ladder will not come off, nothing is sold and the refusal is named — selling under a live ladder would only buy the coin back a minute later."
        : ""}
    </>
  )
}

/** "3 ladders and 2 grids", "1 ladder" — however many of each there are. */
function countedWords(ladders: number, grids: number): string {
  const said: string[] = []
  if (ladders > 0) said.push(`${ladders} ladder${ladders === 1 ? "" : "s"}`)
  if (grids > 0) said.push(`${grids} grid${grids === 1 ? "" : "s"}`)
  return said.join(" and ")
}
