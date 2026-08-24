import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { marketSymbol } from "@/lib/protocols/contracts"
import {
  BASE_STOP_DAYS_REFUSAL,
  BASE_STOP_UNDER_REFUSAL,
  badBaseReclaimDays,
  badBaseUnderPct,
} from "@/lib/trade/base-stop"
import {
  DCA_TP_MODE_HINTS,
  DCA_TP_MODE_LABELS,
  DCA_TP_MODES,
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
  DEFAULT_DCA_STOP_LOSS_PCT,
  DEFAULT_DCA_TAKE_PROFIT_PCT,
  type DcaParams,
  type DcaTpMode,
} from "@/lib/trade/dca"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import type { TradePosition } from "@/lib/trade/paper"

/** A bracket price back to its distance from the entry, for filling a box in. */
function pctFromEntry(entryPx: number | undefined, px: number | null): number | null {
  if (!entryPx || !(entryPx > 0) || px === null) return null
  return Number(((Math.abs(px - entryPx) / entryPx) * 100).toFixed(2))
}

/**
 * Changing a live ladder's exits — the one edit that is always safe, because
 * exits only shape future sells. The rungs themselves are frozen: a different
 * ladder means cancelling this one and placing again.
 *
 * A side that was dragged by hand shows up here as "moved by hand" — saving
 * puts it back under a rule, which is exactly what saving says it does.
 */
export function SmartLadderExitsDialog({
  ladder,
  position,
  busy,
  onSave,
  onClose,
}: {
  ladder: SmartLadder | null
  /** The position the ladder is riding, for reading hand-moved brackets back. */
  position: TradePosition | null
  busy: boolean
  onSave: (
    ladder: SmartLadder,
    exits: {
      takeProfit: DcaParams["takeProfit"]
      stopLoss: DcaParams["stopLoss"]
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  return (
    <Dialog
      open={ladder !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        {ladder ? (
          <ExitsForm
            key={ladder.id}
            ladder={ladder}
            position={position}
            busy={busy}
            onSave={onSave}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ExitsForm({
  ladder,
  position,
  busy,
  onSave,
  onClose,
}: {
  ladder: SmartLadder
  position: TradePosition | null
  busy: boolean
  onSave: (
    ladder: SmartLadder,
    exits: {
      takeProfit: DcaParams["takeProfit"]
      stopLoss: DcaParams["stopLoss"]
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const plan = ladder.plan
  const symbol = marketSymbol(ladder.marketKey)

  const tpFixed = plan.takeProfit?.mode === "fixed"
  const slFixed = plan.stopLoss?.mode === "fixed"

  const [tpOn, setTpOn] = React.useState(plan.takeProfit !== null)
  const [tpMode, setTpMode] = React.useState<DcaTpMode>(
    plan.takeProfit && plan.takeProfit.mode !== "fixed"
      ? plan.takeProfit.mode
      : "average"
  )
  const [tpPct, setTpPct] = React.useState(
    String(
      (tpFixed ? pctFromEntry(position?.entryPx, position?.tpPx ?? null) : null) ??
        plan.takeProfit?.pct ??
        DEFAULT_DCA_TAKE_PROFIT_PCT
    )
  )
  const [slOn, setSlOn] = React.useState(plan.stopLoss !== null)
  const [slPct, setSlPct] = React.useState(
    String(
      (slFixed ? pctFromEntry(position?.entryPx, position?.slPx ?? null) : null) ??
        plan.stopLoss?.pct ??
        DEFAULT_DCA_STOP_LOSS_PCT
    )
  )
  const [baseOn, setBaseOn] = React.useState(plan.stopLoss?.base != null)
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(plan.stopLoss?.base?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(plan.stopLoss?.base?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS)
  )

  const parsedTp = Number(tpPct)
  const badTp =
    tpOn && tpMode === "average" && !(Number.isFinite(parsedTp) && parsedTp > 0)
  const parsedSl = Number(slPct)
  const badSl =
    slOn && !(Number.isFinite(parsedSl) && parsedSl > 0 && parsedSl <= 100)
  const parsedUnder = Number(baseUnderPct)
  const parsedDays = Number(baseReclaimDays)
  // The same two rules the base fields themselves outline, asked one box at a
  // time so the refusal below can name which of them is the problem.
  const badBaseUnder = slOn && baseOn && badBaseUnderPct(baseUnderPct)
  const badBaseDays = slOn && baseOn && badBaseReclaimDays(baseReclaimDays)
  const badBase = badBaseUnder || badBaseDays

  // Every reason this window would refuse, said above the button so nobody
  // presses Save to find out. Same order as the cards on screen.
  const refusal = badTp
    ? "Target % has to be a number above zero. It is measured up from the ladder's average buy price."
    : badSl
      ? "Stop % has to be a number above zero and no more than 100. It is measured down from the ladder's average buy price."
      : badBaseUnder
        ? BASE_STOP_UNDER_REFUSAL
        : badBaseDays
          ? BASE_STOP_DAYS_REFUSAL
          : null

  const save = async () => {
    if (badTp || badSl || badBase) return
    const saved = await onSave(ladder, {
      takeProfit: tpOn
        ? {
            mode: tpMode,
            pct: tpMode === "average" ? parsedTp : DEFAULT_DCA_TAKE_PROFIT_PCT,
          }
        : null,
      stopLoss: slOn
        ? {
            pct: parsedSl,
            base: baseOn
              ? { underPct: parsedUnder, reclaimDays: parsedDays }
              : null,
          }
        : null,
    })
    if (saved) onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Exits for the {symbol} ladder</DialogTitle>
        <DialogDescription>
          Exits are the one safe edit on a live ladder. The rungs are frozen —
          a different ladder means cancelling and placing again.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Take profit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {tpFixed ? (
              <p className="text-xs text-muted-foreground">
                The target was moved by hand and sits where it was put. Saving
                here puts it back under a rule.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="ladder-tp-on"
                checked={tpOn}
                disabled={busy}
                onCheckedChange={(next) => setTpOn(next === true)}
              />
              <FieldLabel htmlFor="ladder-tp-on" hint={DCA_TP_MODE_HINTS[tpMode]}>
                Take profit on
              </FieldLabel>
            </div>
            {tpOn ? (
              <div className="grid gap-4">
                <Select
                  value={tpMode}
                  disabled={busy}
                  onValueChange={(next) => setTpMode(next as DcaTpMode)}
                >
                  <SelectTrigger
                    id="ladder-tp-mode"
                    aria-label="How the ladder takes profit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DCA_TP_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {DCA_TP_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tpMode === "average" ? (
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="ladder-tp-pct"
                      hint="Above the average buy price, re-aimed after every fill."
                    >
                      Target %
                    </FieldLabel>
                    <Input
                      id="ladder-tp-pct"
                      inputMode="decimal"
                      value={tpPct}
                      aria-invalid={badTp}
                      disabled={busy}
                      onChange={(event) => setTpPct(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Stop loss</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {slFixed ? (
              <p className="text-xs text-muted-foreground">
                The stop was moved by hand and sits where it was put. Saving
                here puts it back under a rule.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="ladder-sl-on"
                checked={slOn}
                disabled={busy}
                onCheckedChange={(next) => setSlOn(next === true)}
              />
              <FieldLabel
                htmlFor="ladder-sl-on"
                hint="Below the average buy price, following it. If the stop hits, everything sells and the waiting rungs are cancelled — the ladder is over."
              >
                Stop loss on
              </FieldLabel>
            </div>
            {slOn ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ladder-sl-pct">Stop %</Label>
                  <Input
                    id="ladder-sl-pct"
                    inputMode="decimal"
                    value={slPct}
                    aria-invalid={badSl}
                    disabled={busy}
                    onChange={(event) => setSlPct(event.target.value)}
                  />
                </div>
                <BaseStopFields
                  on={baseOn}
                  underPct={baseUnderPct}
                  reclaimDays={baseReclaimDays}
                  disabled={busy}
                  onOn={setBaseOn}
                  onUnderPct={setBaseUnderPct}
                  onReclaimDays={setBaseReclaimDays}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </DialogBody>

      <DialogFooter>
        {/* Left of the buttons rather than under the fields: the body scrolls,
            and a refusal that scrolls away is one the button can be pressed
            without ever seeing. */}
        <OrderRefusal
          id="ladder-exits-refusal"
          className="mr-auto min-w-0 flex-1"
        >
          {refusal}
        </OrderRefusal>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          aria-describedby={refusal ? "ladder-exits-refusal" : undefined}
          // The base stop's two boxes join the other two here. `save` already
          // turned back on a bad one, so a live button did nothing at all and
          // said nothing about why.
          disabled={busy || badTp || badSl || badBase}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}
