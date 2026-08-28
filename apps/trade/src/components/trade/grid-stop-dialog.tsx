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
  DEFAULT_GRID_TAKE_PROFIT_PCT,
  DEFAULT_GRID_STOP_UNDER_PCT,
  entrySide,
  exitSide,
  gridEndPx,
  gridRangeMovable,
  gridStopBeyond,
  lossEdge,
  GRID_DIRECTION_LABELS,
  MAX_GRID_LEVELS,
  MAX_GRID_STOP_UNDER_PCT,
  MIN_GRID_LEVELS,
  type GridStop,
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
  mark,
  busy,
  pairedLeverage = null,
  positionLeverage = null,
  onSave,
  onReshape,
  onSetEnd,
  onSetFollow,
  onClose,
}: {
  grid: SmartGrid | null
  /** Today's price, used to preview End Grid at the same place as the server. */
  mark: number | null
  busy: boolean
  /** A paired DCA ladder fixes the borrowing for their shared position. */
  pairedLeverage?: number | null
  /** A position already held in this wallet fixes the borrowing. */
  positionLeverage?: number | null
  onSave: (grid: SmartGrid, stopLoss: GridStop) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number; leverage?: number }
  ) => Promise<boolean>
  onSetEnd: (grid: SmartGrid, abovePct: number | null) => Promise<boolean>
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
            mark={mark}
            busy={busy}
            pairedLeverage={pairedLeverage}
            positionLeverage={positionLeverage}
            onSave={onSave}
            onReshape={onReshape}
            onSetEnd={onSetEnd}
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
  mark,
  busy,
  pairedLeverage,
  positionLeverage,
  onSave,
  onReshape,
  onSetEnd,
  onSetFollow,
  onClose,
}: {
  grid: SmartGrid
  mark: number | null
  busy: boolean
  pairedLeverage: number | null
  positionLeverage: number | null
  onSave: (grid: SmartGrid, stopLoss: GridStop) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number; leverage?: number }
  ) => Promise<boolean>
  onSetEnd: (grid: SmartGrid, abovePct: number | null) => Promise<boolean>
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
  const [leverage, setLeverage] = React.useState(String(plan.leverage))
  const [followOn, setFollowOn] = React.useState(plan.follow)
  const [followDownOn, setFollowDownOn] = React.useState(plan.followDown)
  const [endOn, setEndOn] = React.useState(plan.takeProfitPx !== null)
  const [endPct, setEndPct] = React.useState(
    String(
      plan.takeProfitPct ??
        (plan.takeProfitPx !== null
          ? (
              (plan.takeProfitPx / Math.max(plan.topPx, mark ?? plan.topPx) -
                1) *
              100
            ).toFixed(2)
          : DEFAULT_GRID_TAKE_PROFIT_PCT)
    )
  )
  const [endTouched, setEndTouched] = React.useState(false)
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
  const parsedLeverage = Number(leverage)
  const maxBorrowing = Math.max(
    plan.leverage,
    Math.min(50, Math.floor(plan.maxLeverage))
  )
  const badLeverage = !(
    Number.isInteger(parsedLeverage) &&
    parsedLeverage >= 1 &&
    parsedLeverage <= maxBorrowing
  )
  const canReshape = gridRangeMovable(plan)
  const fixedLeverage = positionLeverage ?? pairedLeverage
  const resliced =
    !badLevels &&
    !badPot &&
    !badLeverage &&
    (parsedLevels !== plan.levels.length ||
      parsedPot !== plan.potPct ||
      parsedLeverage !== plan.leverage)

  // What one round trip would be worth after re-slicing, which is the number
  // that decides whether more levels is a good idea or a slower way to pay
  // fees. A range cut finer earns less each time round.
  const step = !badLevels ? (plan.topPx - plan.bottomPx) / parsedLevels : null
  const followChanged =
    followOn !== plan.follow || followDownOn !== plan.followDown
  const parsedEnd = Number(endPct)
  const badEnd =
    endOn && !(Number.isFinite(parsedEnd) && parsedEnd > 0 && parsedEnd <= 999)
  const endChanged =
    endTouched &&
    (endOn !== (plan.takeProfitPx !== null) ||
      (endOn && parsedEnd !== plan.takeProfitPct))
  const endAt =
    endOn && !badEnd && mark !== null
      ? gridEndPx(plan.direction, plan, mark, parsedEnd)
      : endOn
        ? plan.takeProfitPx
        : null
  const parsedUnder = Number(underPct)
  const badUnder = !(
    Number.isFinite(parsedUnder) &&
    parsedUnder >= 0 &&
    parsedUnder <= MAX_GRID_STOP_UNDER_PCT
  )
  const parsedBaseUnder = Number(baseUnderPct)
  const parsedDays = Number(baseReclaimDays)
  // The same two rules the base fields themselves outline, asked one box at a
  // time so the refusal below can name which of them is the problem.
  const badBaseUnder = baseOn && badBaseUnderPct(baseUnderPct)
  const badBaseDays = baseOn && badBaseReclaimDays(baseReclaimDays)
  const badBase = badBaseUnder || badBaseDays
  const stopChanged =
    plan.stopLoss === null ||
    (plan.stopLoss !== null &&
      (parsedUnder !== plan.stopLoss.underPct ||
        baseOn !== (plan.stopLoss.base !== null) ||
        (baseOn &&
          plan.stopLoss.base !== null &&
          (parsedBaseUnder !== plan.stopLoss.base.underPct ||
            parsedDays !== plan.stopLoss.base.reclaimDays))))

  // Where it would rest, shown as a price. A percent below a percent is a
  // number nobody can check; the price it lands on is one anybody can.
  const restsAt = !badUnder
    ? plan.stopLoss?.mode === "fixed" && !stopChanged
      ? plan.stopLoss.px
      : gridStopBeyond(plan.direction, plan, parsedUnder)
    : null

  // The end of the range the stop hangs off, and the word for it. The bottom
  // on a buying grid, the top on a selling one.
  const lossPx = lossEdge(plan.direction, plan)
  const edgeWord = plan.direction === "long" ? "bottom" : "top"
  const stopFieldLabel =
    plan.direction === "long" ? "Below the bottom %" : "Above the top %"

  // Every reason this window would refuse, said above the button so nobody
  // presses Save to find out. Same order as the cards on screen.
  const refusal = badLevels
    ? `Levels has to be a whole number between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS}.`
    : badPot
      ? "Share of account % has to be a number above zero and no more than 100."
      : badLeverage
        ? `Borrowing has to be a whole number between 1× and ${maxBorrowing}×.`
        : badEnd
          ? "Above price or range % has to be a number above zero and no more than 999."
          : badUnder
            ? `Below the bottom % has to be between 0 and ${MAX_GRID_STOP_UNDER_PCT}. At 0 the stop rests on the range's bottom of ${formatPrice(plan.bottomPx)}.`
            : badBaseUnder
              ? BASE_STOP_UNDER_REFUSAL
              : badBaseDays
                ? BASE_STOP_DAYS_REFUSAL
                : null

  const save = async () => {
    if (busy) return
    if (badUnder || badBase || badLevels || badPot || badLeverage || badEnd) {
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
        leverage: parsedLeverage,
      })
      if (!shaped) return
    }
    if (endChanged) {
      const ended = await onSetEnd(grid, endOn ? parsedEnd : null)
      if (!ended) return
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
      ? await onSave(grid, {
          underPct: parsedUnder,
          base: baseOn
            ? { underPct: parsedBaseUnder, reclaimDays: parsedDays }
            : null,
        })
      : true
    if (saved) onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>The {symbol} grid</DialogTitle>
        {/* Which way round it runs is stated, never offered. The prices are
            frozen and they belong to one side, so turning a live grid round
            would leave every level closing at a price it never opened at. */}
        <DialogDescription>
          {GRID_DIRECTION_LABELS[plan.direction]}, working between{" "}
          {formatPrice(plan.bottomPx)} and {formatPrice(plan.topPx)}. Each level{" "}
          {entrySide(plan.direction)}s at its own price and{" "}
          {exitSide(plan.direction)}s one step{" "}
          {plan.direction === "long" ? "above" : "below"} it. Drag the two blue
          lines on the chart to move the range itself.
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
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-edit-leverage"
                hint={
                  positionLeverage !== null
                    ? "The position already held in this wallet fixed the borrowing for this coin. Grid buys add to the same position, so they must use the same number."
                    : pairedLeverage !== null
                      ? "The paired DCA ladder fixed the borrowing for this coin. The grid shares the same position, so both must use the same number."
                      : canReshape
                        ? "How many dollars of coin each dollar behind the grid buys. Changing borrowing redraws every waiting level."
                        : "Borrowing can change only while the grid holds no coin and still has buys waiting."
                }
              >
                Borrowing ×
              </FieldLabel>
              <Input
                id="grid-edit-leverage"
                inputMode="numeric"
                value={fixedLeverage ?? leverage}
                aria-invalid={showValidation && badLeverage}
                disabled={busy || !canReshape || fixedLeverage !== null}
                onChange={(event) => {
                  setShowValidation(false)
                  setLeverage(event.target.value)
                }}
                onBlur={() => setShowValidation(true)}
              />
            </div>
            {resliced ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Saving redraws every waiting level. Nothing buys until price
                reaches a level.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>End Grid</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-end-on"
                checked={endOn}
                disabled={busy}
                onCheckedChange={(next) => {
                  setShowValidation(false)
                  setEndTouched(true)
                  setEndOn(next === true)
                }}
              />
              <FieldLabel
                htmlFor="grid-end-on"
                hint={`Reaching End Grid closes the grid and ${exitSide(plan.direction)}s back anything it still holds.`}
              >
                {plan.direction === "long"
                  ? "End the grid at an upper price"
                  : "End the grid at a lower price"}
              </FieldLabel>
            </div>
            {endOn ? (
              <>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="grid-end-pct"
                    hint="Measured above today's price or the top of the range, whichever is higher. Reaching this line closes the grid."
                  >
                    Above price or range %
                  </FieldLabel>
                  <Input
                    id="grid-end-pct"
                    inputMode="decimal"
                    value={endPct}
                    aria-invalid={showValidation && badEnd}
                    disabled={busy}
                    onChange={(event) => {
                      setShowValidation(false)
                      setEndTouched(true)
                      setEndPct(event.target.value)
                    }}
                    onBlur={() => setShowValidation(true)}
                  />
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Grid ends at</span>
                  <span className="tabular-nums">
                    {endAt === null ? "—" : formatPrice(endAt)}
                  </span>
                </div>
              </>
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
                hint={
                  plan.direction === "long"
                    ? "When price climbs past the top of the range, the whole range slides up behind it and the grid carries on instead of waiting above its range. It costs nothing, because by the time price is up there every level has already sold. The stop under the range slides up with it. The End Grid line stays fixed and closes the grid when price reaches it."
                    : "Careful: this walks a selling grid towards its loss. When price climbs past the top, the range adds one new higher sell per pass. Levels already sold keep their original buy-back prices, and the stop stays where it is."
                }
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
                hint={
                  plan.direction === "long"
                    ? "Careful: this walks a buying grid towards its loss. When price falls through the bottom, the range adds one new lower buy per pass. Filled levels above it keep their original sell prices, and the stop stays where it is."
                    : "When price falls past the bottom of the range, the whole range slides down behind it and the grid carries on instead of waiting below its range. It costs nothing, because by the time price is down there every level has already bought back. The stop above the range slides down with it. The End Grid line stays fixed and closes the grid when price reaches it."
                }
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
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="grid-stop-pct">{stopFieldLabel}</Label>
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
                    ? `The ${edgeWord} of the range is ${formatPrice(lossPx)}.`
                    : `Rests at ${formatPrice(restsAt)}, ${plan.direction === "long" ? "under" : "over"} the range's ${edgeWord} of ${formatPrice(lossPx)}.`}
                </p>
              </div>
              <BaseStopFields
                on={baseOn}
                underPct={baseUnderPct}
                reclaimDays={baseReclaimDays}
                disabled={busy}
                showErrors={showValidation}
                direction={plan.direction}
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
