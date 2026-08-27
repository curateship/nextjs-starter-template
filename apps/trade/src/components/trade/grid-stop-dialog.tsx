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
import { marketSymbol } from "@/lib/protocols/contracts"
import {
  BASE_STOP_DAYS_REFUSAL,
  BASE_STOP_UNDER_REFUSAL,
  badBaseReclaimDays,
  badBaseUnderPct,
} from "@/lib/trade/base-stop"
import {
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
} from "@/lib/trade/dca"
import { formatPrice } from "@/lib/trade/format"
import {
  DEFAULT_GRID_STOP_UNDER_PCT,
  gridStopUnder,
  MAX_GRID_LEVELS,
  MAX_GRID_STOP_UNDER_PCT,
  MIN_GRID_LEVELS,
  type GridParams,
} from "@/lib/trade/grid"
import type { SmartGrid } from "@/lib/trade/smart-plan"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Changing a running grid: how it is sliced, and where it gets out.
 *
 * The range itself is dragged on the chart, not typed here — the two blue lines
 * are the thing you set. What this window is for is everything a line cannot
 * say: how many slices the range is cut into, how much of the account each one
 * spends, and the two prices that end the grid.
 *
 * Its own small window rather than a branch inside the ladder's exits window,
 * which is eight hundred lines and asks about three things a grid does not
 * have.
 */
export function GridStopDialog({
  grid,
  busy,
  onSave,
  onReshape,
  onSetFollow,
  onClose,
}: {
  grid: SmartGrid | null
  busy: boolean
  onSave: (
    grid: SmartGrid,
    stopLoss: GridParams["stopLoss"]
  ) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number }
  ) => Promise<boolean>
  onSetFollow: (
    grid: SmartGrid,
    following: { up: boolean; down: boolean }
  ) => Promise<boolean>
  onClose: () => void
}) {
  return (
    <Dialog
      open={grid !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        {grid ? (
          <StopForm
            key={grid.id}
            grid={grid}
            busy={busy}
            onSave={onSave}
            onReshape={onReshape}
            onSetFollow={onSetFollow}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function StopForm({
  grid,
  busy,
  onSave,
  onReshape,
  onSetFollow,
  onClose,
}: {
  grid: SmartGrid
  busy: boolean
  onSave: (
    grid: SmartGrid,
    stopLoss: GridParams["stopLoss"]
  ) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number }
  ) => Promise<boolean>
  onSetFollow: (
    grid: SmartGrid,
    following: { up: boolean; down: boolean }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const plan = grid.plan
  const symbol = marketSymbol(grid.marketKey)

  const [levels, setLevels] = React.useState(String(plan.levels.length))
  const [potPct, setPotPct] = React.useState(String(plan.potPct))
  const [followOn, setFollowOn] = React.useState(plan.follow)
  const [followDownOn, setFollowDownOn] = React.useState(plan.followDown)
  const [slOn, setSlOn] = React.useState(plan.stopLoss !== null)
  const [underPct, setUnderPct] = React.useState(
    String(plan.stopLoss?.underPct ?? DEFAULT_GRID_STOP_UNDER_PCT)
  )
  const [baseOn, setBaseOn] = React.useState(plan.stopLoss?.base != null)
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(plan.stopLoss?.base?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(plan.stopLoss?.base?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS)
  )
  const [showValidation, setShowValidation] = React.useState(false)

  const parsedLevels = Number(levels)
  const badLevels = !(
    Number.isInteger(parsedLevels) &&
    parsedLevels >= MIN_GRID_LEVELS &&
    parsedLevels <= MAX_GRID_LEVELS
  )
  const parsedPot = Number(potPct)
  const badPot = !(
    Number.isFinite(parsedPot) &&
    parsedPot > 0 &&
    parsedPot <= 100
  )
  const resliced =
    !badLevels &&
    !badPot &&
    (parsedLevels !== plan.levels.length || parsedPot !== plan.potPct)

  // What one round trip would be worth after re-slicing, which is the number
  // that decides whether more levels is a good idea or a slower way to pay
  // fees. A range cut finer earns less each time round.
  const step = !badLevels ? (plan.topPx - plan.bottomPx) / parsedLevels : null
  const followChanged =
    followOn !== plan.follow || followDownOn !== plan.followDown
  const parsedUnder = Number(underPct)
  const badUnder =
    slOn &&
    !(
      Number.isFinite(parsedUnder) &&
      parsedUnder >= 0 &&
      parsedUnder <= MAX_GRID_STOP_UNDER_PCT
    )
  const parsedBaseUnder = Number(baseUnderPct)
  const parsedDays = Number(baseReclaimDays)
  // The same two rules the base fields themselves outline, asked one box at a
  // time so the refusal below can name which of them is the problem.
  const badBaseUnder = slOn && baseOn && badBaseUnderPct(baseUnderPct)
  const badBaseDays = slOn && baseOn && badBaseReclaimDays(baseReclaimDays)
  const badBase = badBaseUnder || badBaseDays
  const stopChanged =
    slOn !== (plan.stopLoss !== null) ||
    (slOn &&
      plan.stopLoss !== null &&
      (parsedUnder !== plan.stopLoss.underPct ||
        baseOn !== (plan.stopLoss.base !== null) ||
        (baseOn &&
          plan.stopLoss.base !== null &&
          (parsedBaseUnder !== plan.stopLoss.base.underPct ||
            parsedDays !== plan.stopLoss.base.reclaimDays))))

  // Where it would rest, shown as a price. A percent below a percent is a
  // number nobody can check; the price it lands on is one anybody can.
  const restsAt =
    slOn && !badUnder
      ? plan.stopLoss?.mode === "fixed" && !stopChanged
        ? plan.stopLoss.px
        : gridStopUnder(plan.bottomPx, parsedUnder)
      : null

  // Every reason this window would refuse, said above the button so nobody
  // presses Save to find out. Same order as the cards on screen.
  const refusal = badLevels
    ? `Levels has to be a whole number between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS}.`
    : badPot
      ? "Share of account % has to be a number above zero and no more than 100."
      : badUnder
        ? `Below the bottom % has to be between 0 and ${MAX_GRID_STOP_UNDER_PCT}. At 0 the stop rests on the range's bottom of ${formatPrice(plan.bottomPx)}.`
        : badBaseUnder
          ? BASE_STOP_UNDER_REFUSAL
          : badBaseDays
            ? BASE_STOP_DAYS_REFUSAL
            : null

  const save = async () => {
    if (busy) return
    if (badUnder || badBase || badLevels || badPot) {
      setShowValidation(true)
      if (refusal) showErrorToast(refusal)
      return
    }
    // Re-slice first: it redraws every level, and the stop is written against
    // the range those levels sit in.
    if (resliced) {
      const shaped = await onReshape(grid, {
        levels: parsedLevels,
        potPct: parsedPot,
      })
      if (!shaped) return
    }
    // Then following, which only flips a flag. After the re-slice so it is
    // written onto the levels the re-slice drew, not the ones it replaced.
    if (followChanged) {
      const followed = await onSetFollow(grid, {
        up: followOn,
        down: followDownOn,
      })
      if (!followed) return
    }
    const saved = stopChanged
      ? await onSave(
          grid,
          slOn
            ? {
                underPct: parsedUnder,
                base: baseOn
                  ? { underPct: parsedBaseUnder, reclaimDays: parsedDays }
                  : null,
              }
            : null
        )
      : true
    if (saved) onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>The {symbol} grid</DialogTitle>
        <DialogDescription>
          Working between {formatPrice(plan.bottomPx)} and{" "}
          {formatPrice(plan.topPx)} — drag those two lines on the chart to move
          the range itself.
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <Card>
          <CardHeader>
            <CardTitle>Slices</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-edit-levels"
                hint="How many slices the range is cut into. More slices means each one trades more often but earns less per round trip — and below a certain point the trading fee eats it, which is refused."
              >
                Levels
              </FieldLabel>
              <Input
                id="grid-edit-levels"
                inputMode="numeric"
                value={levels}
                aria-invalid={showValidation && badLevels}
                disabled={busy}
                onChange={(event) => {
                  setShowValidation(false)
                  setLevels(event.target.value)
                }}
                onBlur={() => setShowValidation(true)}
              />
              {step !== null ? (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(step)} between slices, which is what one round
                  trip earns a coin before fees.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-edit-pot"
                hint="The share of the account the whole grid spends, split evenly across the slices. Every slice always spends the same amount, cycle after cycle."
              >
                Share of account %
              </FieldLabel>
              <Input
                id="grid-edit-pot"
                inputMode="decimal"
                value={potPct}
                aria-invalid={showValidation && badPot}
                disabled={busy}
                onChange={(event) => {
                  setShowValidation(false)
                  setPotPct(event.target.value)
                }}
                onBlur={() => setShowValidation(true)}
              />
            </div>
            {resliced ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Saving re-cuts the range and settles what is held to match —
                buying what the new slices need, or selling what they no longer
                do.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Following</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-follow-on"
                checked={followOn}
                disabled={busy}
                onCheckedChange={(next) => {
                  setShowValidation(false)
                  setFollowOn(next === true)
                }}
              />
              <FieldLabel
                htmlFor="grid-follow-on"
                hint="When price climbs past the top of the range, the whole range slides up behind it and the grid carries on instead of waiting above its range. It costs nothing, because by the time price is up there every level has already sold. The stop under the range slides up with it. The End Grid line stays fixed and closes the grid when price reaches it."
              >
                Follow price up
              </FieldLabel>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-follow-down-on"
                checked={followDownOn}
                disabled={busy}
                onCheckedChange={(next) => {
                  setShowValidation(false)
                  setFollowDownOn(next === true)
                }}
              />
              <FieldLabel
                htmlFor="grid-follow-down-on"
                hint="When price falls through the bottom, the range adds one new lower buy per pass. Filled levels above it keep their original sell prices."
              >
                Follow price down
              </FieldLabel>
            </div>
            <p className="text-xs text-muted-foreground">
              {plan.shifts === 0 && plan.downShifts === 0
                ? "The range has not moved yet."
                : `Moved up ${plan.shifts} time${plan.shifts === 1 ? "" : "s"} and down ${plan.downShifts} time${plan.downShifts === 1 ? "" : "s"}.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stop loss</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-stop-on"
                checked={slOn}
                disabled={busy}
                onCheckedChange={(next) => {
                  setShowValidation(false)
                  setSlOn(next === true)
                }}
              />
              <FieldLabel
                htmlFor="grid-stop-on"
                hint="Below the bottom of the range, and it stays there. If the stop hits, everything held is sold and the grid is over. It deliberately does not follow your average buy price — that average falls as the grid recycles, which would drag the stop up into the range and sell the grid on an ordinary dip."
              >
                Stop loss on
              </FieldLabel>
            </div>
            {slOn ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="grid-stop-pct">Below the bottom %</Label>
                  <Input
                    id="grid-stop-pct"
                    inputMode="decimal"
                    value={underPct}
                    aria-invalid={showValidation && badUnder}
                    disabled={busy}
                    onChange={(event) => {
                      setShowValidation(false)
                      setUnderPct(event.target.value)
                    }}
                    onBlur={() => setShowValidation(true)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {restsAt === null
                      ? "The bottom of the range is " +
                        formatPrice(plan.bottomPx) +
                        "."
                      : `Rests at ${formatPrice(restsAt)}, under the range's bottom of ${formatPrice(plan.bottomPx)}.`}
                  </p>
                </div>
                <BaseStopFields
                  on={baseOn}
                  underPct={baseUnderPct}
                  reclaimDays={baseReclaimDays}
                  disabled={busy}
                  showErrors={showValidation}
                  onOn={(next) => {
                    setShowValidation(false)
                    setBaseOn(next)
                  }}
                  onUnderPct={(next) => {
                    setShowValidation(false)
                    setBaseUnderPct(next)
                  }}
                  onReclaimDays={(next) => {
                    setShowValidation(false)
                    setBaseReclaimDays(next)
                  }}
                  onBlur={() => setShowValidation(true)}
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
        <OrderRefusal id="grid-stop-refusal" className="mr-auto min-w-0 flex-1">
          {showValidation ? refusal : null}
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
          aria-describedby={
            showValidation && refusal ? "grid-stop-refusal" : undefined
          }
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}
