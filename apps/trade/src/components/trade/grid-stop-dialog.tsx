import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
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
import { parseMarketKey } from "@/lib/protocols/contracts"
import {
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
} from "@/lib/trade/dca"
import { formatPrice } from "@/lib/trade/format"
import {
  DEFAULT_GRID_STOP_UNDER_PCT,
  gridStopUnder,
  MAX_GRID_LEVELS,
  MIN_GRID_LEVELS,
  type GridParams,
} from "@/lib/trade/grid"
import type { SmartGrid } from "@/lib/trade/smart-plan"

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
  onSave: (grid: SmartGrid, stopLoss: GridParams["stopLoss"]) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number }
  ) => Promise<boolean>
  onSetFollow: (grid: SmartGrid, follow: boolean) => Promise<boolean>
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
  onSave: (grid: SmartGrid, stopLoss: GridParams["stopLoss"]) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: { levels?: number; potPct?: number }
  ) => Promise<boolean>
  onSetFollow: (grid: SmartGrid, follow: boolean) => Promise<boolean>
  onClose: () => void
}) {
  const plan = grid.plan
  const symbol = parseMarketKey(grid.marketKey)?.marketId ?? grid.marketKey

  const [levels, setLevels] = React.useState(String(plan.levels.length))
  const [potPct, setPotPct] = React.useState(String(plan.potPct))
  const [followOn, setFollowOn] = React.useState(plan.follow)
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

  const parsedLevels = Number(levels)
  const badLevels = !(
    Number.isInteger(parsedLevels) &&
    parsedLevels >= MIN_GRID_LEVELS &&
    parsedLevels <= MAX_GRID_LEVELS
  )
  const parsedPot = Number(potPct)
  const badPot = !(Number.isFinite(parsedPot) && parsedPot > 0 && parsedPot <= 100)
  const resliced =
    !badLevels &&
    !badPot &&
    (parsedLevels !== plan.levels.length || parsedPot !== plan.potPct)

  // What one round trip would be worth after re-slicing, which is the number
  // that decides whether more levels is a good idea or a slower way to pay
  // fees. A range cut finer earns less each time round.
  const step = !badLevels
    ? (plan.topPx - plan.bottomPx) / parsedLevels
    : null
  const followChanged = followOn !== plan.follow
  const parsedUnder = Number(underPct)
  const badUnder =
    slOn && !(Number.isFinite(parsedUnder) && parsedUnder >= 0 && parsedUnder <= 50)
  const parsedBaseUnder = Number(baseUnderPct)
  const parsedDays = Number(baseReclaimDays)
  const badBase =
    slOn &&
    baseOn &&
    !(
      Number.isFinite(parsedBaseUnder) &&
      parsedBaseUnder >= 0 &&
      parsedBaseUnder <= 50 &&
      Number.isFinite(parsedDays) &&
      parsedDays >= 0 &&
      parsedDays <= 90
    )

  // Where it would rest, shown as a price. A percent below a percent is a
  // number nobody can check; the price it lands on is one anybody can.
  const restsAt =
    slOn && !badUnder ? gridStopUnder(plan.bottomPx, parsedUnder) : null

  const save = async () => {
    if (badUnder || badBase || badLevels || badPot) return
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
      const followed = await onSetFollow(grid, followOn)
      if (!followed) return
    }
    const saved = await onSave(
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
                aria-invalid={badLevels}
                disabled={busy}
                onChange={(event) => setLevels(event.target.value)}
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
                aria-invalid={badPot}
                disabled={busy}
                onChange={(event) => setPotPct(event.target.value)}
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
                onCheckedChange={(next) => setFollowOn(next === true)}
              />
              <FieldLabel
                htmlFor="grid-follow-on"
                hint="When price climbs past the top of the range, the whole range slides up behind it and the grid carries on instead of waiting above its range. It costs nothing, because by the time price is up there every level has already sold. The stop under the range slides up with it."
              >
                Follow price up
              </FieldLabel>
            </div>
            {followOn && plan.takeProfitPx !== null ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Saving removes the finish line at{" "}
                {formatPrice(plan.takeProfitPx)}. A range that slides up ahead
                of price can never reach a line above it, so a following grid
                runs until you switch this off or the stop is hit.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {plan.shifts === 0
                ? "The range has not moved yet."
                : `The range has moved up ${plan.shifts} time${plan.shifts === 1 ? "" : "s"} so far.`}
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
                onCheckedChange={(next) => setSlOn(next === true)}
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
                    aria-invalid={badUnder}
                    disabled={busy}
                    onChange={(event) => setUnderPct(event.target.value)}
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
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy || badUnder || badBase || badLevels || badPot}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}
