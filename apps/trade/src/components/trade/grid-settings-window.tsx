import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import {
  MIN_ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_WIDTH,
  orderWindowBeside,
} from "@/components/trade/order-window-form"
import { OptionCard } from "@/components/trade/option-card"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { formatPrice, formatUsd } from "@/lib/trade/format"
import {
  DEFAULT_GRID_TAKE_PROFIT_PCT,
  DEFAULT_GRID_STOP_UNDER_PCT,
  entryWord,
  exitSide,
  gridEndPx,
  gridEvenRungPcts,
  gridLevelPctsFromRows,
  gridRowPctsFromLevels,
  gridRangeReshapable,
  gridRowRungNumber,
  gridRungRowsWithLargestFurthest,
  gridRungPctsSum,
  gridStopBeyond,
  lossEdge,
  MAX_GRID_LEVELS,
  MAX_GRID_STOP_UNDER_PCT,
  MIN_GRID_LEVELS,
  type GridPlan,
  type GridStop,
} from "@/lib/trade/grid"
import type { SmartGrid } from "@/lib/trade/smart-plan"
import { showErrorToast } from "@/lib/toast/error-toast"

/** One row of the Rungs card. Its id is minted once — see the placement window. */
type Rung = { id: string; value: string }

let nextRungId = 0

function rungsFrom(pcts: readonly number[]): Rung[] {
  return pcts.map((pct) => ({
    id: `grid-edit-rung-${(nextRungId += 1)}`,
    value: String(pct),
  }))
}

/**
 * What share of the grid's money each level is on right now, in level order.
 *
 * A hand-set grid says so itself. An evenly split one is read back from what
 * the levels actually hold rather than assumed to be a clean 1/n, because the
 * market's size step rounds every level and the rounded truth is what somebody
 * opening this card should be starting from.
 */
function currentLevelPcts(plan: GridPlan): number[] {
  if (
    plan.manualRungPcts &&
    plan.manualRungPcts.length === plan.levels.length
  ) {
    return plan.manualRungPcts
  }
  const pot = plan.levels.reduce((sum, one) => sum + one.budget, 0)
  if (!(pot > 0)) return gridEvenRungPcts(plan.levels.length)
  return plan.levels.map((one) => Math.round((one.budget / pot) * 10000) / 100)
}

/**
 * Changing a running grid: how it is sliced, and where it gets out.
 *
 * The range itself is dragged on the chart, not typed here — the two blue lines
 * are the thing you set. What this window is for is everything a line cannot
 * say: how many slices the range is cut into, how much of the account each one
 * spends, and the two prices that end the grid.
 *
 * The grid keeps its own small window because its slices, range and follow
 * rules do not belong in the DCA ladder form.
 */
export function GridSettingsWindow({
  grid,
  anchor = null,
  wide = true,
  wallet,
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
  /** The chart cog this floating dropdown sits beside. */
  anchor?: HTMLElement | null
  wide?: boolean
  wallet: string
  /** Today's price, used to preview End Grid at the same place as the server. */
  mark: number | null
  busy: boolean
  /** A paired DCA ladder fixes the borrowing for their shared position. */
  pairedLeverage?: number | null
  /** A position already held in this wallet fixes the borrowing. */
  positionLeverage?: number | null
  onSave: (
    grid: SmartGrid,
    stopLoss: GridStop,
    reverseWhenStopped?: boolean
  ) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: {
      levels?: number
      potPct?: number
      leverage?: number
      manualSizing?: boolean
      manualRungPcts?: number[]
    }
  ) => Promise<boolean>
  onSetEnd: (grid: SmartGrid, abovePct: number | null) => Promise<boolean>
  onSetFollow: (
    grid: SmartGrid,
    following: { up: boolean; down: boolean }
  ) => Promise<boolean>
  onClose: () => void
}) {
  if (!grid) return null

  return (
    <FloatingOrderWindow
      label={`Settings for the ${marketSymbol(grid.marketKey)} grid`}
      wide={wide}
      openedAt={orderWindowBeside(anchor)}
      width={ORDER_WINDOW_WIDTH}
      height={ORDER_WINDOW_HEIGHT}
      minimumHeight={MIN_ORDER_WINDOW_HEIGHT}
      title="Grid settings"
      wallet={wallet}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
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
    </FloatingOrderWindow>
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
  onSave: (
    grid: SmartGrid,
    stopLoss: GridStop,
    reverseWhenStopped?: boolean
  ) => Promise<boolean>
  onReshape: (
    grid: SmartGrid,
    shape: {
      levels?: number
      potPct?: number
      leverage?: number
      manualSizing?: boolean
      manualRungPcts?: number[]
    }
  ) => Promise<boolean>
  onSetEnd: (grid: SmartGrid, abovePct: number | null) => Promise<boolean>
  onSetFollow: (
    grid: SmartGrid,
    following: { up: boolean; down: boolean }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const plan = grid.plan
  const [levels, setLevels] = React.useState(String(plan.levels.length))
  const [potPct, setPotPct] = React.useState(String(plan.potPct))
  const [manualOn, setManualOn] = React.useState(plan.manualSizing)
  const [rungs, setRungs] = React.useState<Rung[]>(() =>
    // The plan speaks in level order; the card's rows run top of the range
    // first, which is that list read backwards. A backwards saved split is
    // shown in the corrected order, but the grid changes only after Save.
    rungsFrom(
      gridRungRowsWithLargestFurthest(
        plan.direction,
        gridRowPctsFromLevels(currentLevelPcts(plan))
      )
    )
  )
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
  const [reverseOn, setReverseOn] = React.useState(
    plan.reverseWhenStopped ?? false
  )
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(plan.stopLoss?.base?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(plan.stopLoss?.base?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS)
  )
  const [showValidation, setShowValidation] = React.useState(false)

  const parsedLevels = Number(levels)
  // The Levels box is not on screen while the Rungs card is counting them, so
  // a leftover in it must not refuse a grid that no longer reads it.
  const badLevels =
    !manualOn &&
    !(
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
  const canReshape = gridRangeReshapable(plan)
  const fixedLeverage = positionLeverage ?? pairedLeverage

  // ----- The hand-set split ----------------------------------------------

  const rungPcts = rungs.map((one) => Number(one.value))
  const rungSum = gridRungPctsSum(rungPcts)
  const badRung = rungPcts.findIndex(
    (pct) => !(Number.isFinite(pct) && pct > 0 && pct <= 100)
  )
  const badRungCount =
    rungs.length < MIN_GRID_LEVELS || rungs.length > MAX_GRID_LEVELS
  const badRungs = manualOn && (badRung !== -1 || badRungCount)
  // The card's rows go to the server as they are; level order is that list
  // read backwards, which is what the running grid is compared against.
  const levelPcts = gridLevelPctsFromRows(rungPcts)
  const wasLevelPcts = currentLevelPcts(plan)
  // A hand-set grid's level count comes from the rows, so a changed row count
  // IS a re-slice. Amounts are compared with a little slack, because the ones
  // read back off the levels were rounded to two decimals to be shown.
  const splitChanged =
    manualOn !== plan.manualSizing ||
    (manualOn &&
      (levelPcts.length !== wasLevelPcts.length ||
        levelPcts.some(
          (pct, index) => Math.abs(pct - wasLevelPcts[index]) > 0.005
        )))
  const resliced =
    !badLevels &&
    !badPot &&
    !badLeverage &&
    !badRungs &&
    (splitChanged ||
      (!manualOn && parsedLevels !== plan.levels.length) ||
      parsedPot !== plan.potPct ||
      parsedLeverage !== plan.leverage)

  // What one round trip would be worth after re-slicing, which is the number
  // that decides whether more levels is a good idea or a slower way to pay
  // fees. A range cut finer earns less each time round.
  const sliceCount = manualOn ? rungs.length : parsedLevels
  const step =
    !badLevels && sliceCount > 0
      ? (plan.topPx - plan.bottomPx) / sliceCount
      : null
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
  const reverseChanged = reverseOn !== (plan.reverseWhenStopped ?? false)
  const stopChanged =
    reverseChanged ||
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
        : manualOn && badRung !== -1
          ? `Rung ${gridRowRungNumber(badRung, rungs.length, plan.direction)} needs a share above zero.`
          : manualOn && badRungCount
            ? `A hand-set grid needs between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} rungs.`
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
    if (
      badUnder ||
      badBase ||
      badLevels ||
      badPot ||
      badLeverage ||
      badRungs ||
      badEnd
    ) {
      setShowValidation(true)
      if (refusal) showErrorToast(refusal)
      return
    }
    // Re-slice first: it redraws every level, and the stop is written against
    // the range those levels sit in.
    if (resliced) {
      const shaped = await onReshape(grid, {
        // On a hand-set grid the rows are the level count, so the server is
        // sent the split and works the count out from it.
        levels: manualOn ? undefined : parsedLevels,
        potPct: parsedPot,
        leverage: parsedLeverage,
        manualSizing: manualOn,
        manualRungPcts: manualOn ? rungPcts : undefined,
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
    // The switch travels only when it changed — a hand that never touched it
    // must not overwrite what the engine holds, and a two-argument call stays
    // a two-argument call.
    const nextStop = {
      underPct: parsedUnder,
      base: baseOn
        ? { underPct: parsedBaseUnder, reclaimDays: parsedDays }
        : null,
    }
    const saved = stopChanged
      ? reverseChanged
        ? await onSave(grid, nextStop, reverseOn)
        : await onSave(grid, nextStop)
      : true
    if (saved) onClose()
  }

  // ----- The Rungs card's rows -------------------------------------------

  const setRung = (id: string, value: string) => {
    setShowValidation(false)
    setRungs((held) =>
      held.map((one) => (one.id === id ? { ...one, value } : one))
    )
  }
  const removeRung = (id: string) =>
    setRungs((held) => held.filter((one) => one.id !== id))
  const addRung = () =>
    setRungs((held) => {
      const last = Number(held[held.length - 1]?.value)
      return [
        ...held,
        ...rungsFrom([Number.isFinite(last) && last > 0 ? last : 10]),
      ]
    })
  const evenSplit = () =>
    setRungs((held) => rungsFrom(gridEvenRungPcts(held.length)))

  // What the whole grid is working with, as the typed settings would leave it.
  // The pot moves in step with Share of account % and with Borrowing, so a row
  // shows what it would actually control rather than what it controls today.
  const potNow = (() => {
    const held = plan.levels.reduce((sum, one) => sum + one.budget, 0)
    if (badPot || badLeverage || !(plan.potPct > 0) || !(plan.leverage > 0)) {
      return held
    }
    return held * (parsedPot / plan.potPct) * (parsedLeverage / plan.leverage)
  })()

  return (
    <>
      <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
        <div className="grid gap-4 p-3">
          <OptionCard
            id="grid-edit-slices"
            title="Slices"
            hint="How many slices the range uses, how much of the account they share, and how much coin each dollar controls."
            summary={`${sliceCount} levels`}
          >
            <div className="grid gap-2">
              {/* The Rungs card's own header counts its rungs, so nothing is
                  said here while it is on. */}
              {manualOn ? null : (
                <>
                  <FieldLabel
                    htmlFor="grid-edit-levels"
                    hint="How many slices the range is cut into. More slices means each one trades more often but earns less per round trip — and below a certain point the trading fee eats it, which is refused."
                  >
                    Levels
                  </FieldLabel>
                  <DisabledReason
                    disabled={busy || !canReshape}
                    reason={
                      busy
                        ? "Trade is saving another change."
                        : "The level count can change only while the grid holds no coin. With one open entry, the range lines can still compress or expand around it."
                    }
                    className="w-full"
                  >
                    <Input
                      id="grid-edit-levels"
                      inputMode="numeric"
                      value={levels}
                      aria-invalid={showValidation && badLevels}
                      disabled={busy || !canReshape}
                      onChange={(event) => {
                        setShowValidation(false)
                        setLevels(event.target.value)
                      }}
                      onBlur={() => setShowValidation(true)}
                      className="bg-background"
                    />
                  </DisabledReason>
                </>
              )}
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
                hint={
                  manualOn
                    ? "The share of the account the whole grid spends. The Rungs card divides this money between the slices."
                    : "The share of the account the whole grid spends, split evenly across the slices. Every slice always spends the same amount, cycle after cycle."
                }
              >
                Share of account %
              </FieldLabel>
              <DisabledReason
                disabled={busy || !canReshape}
                reason={
                  busy
                    ? "Trade is saving another change."
                    : "The account share can change only while the grid holds no coin. With one open entry, the range lines can still compress or expand around it."
                }
                className="w-full"
              >
                <Input
                  id="grid-edit-pot"
                  inputMode="decimal"
                  value={potPct}
                  aria-invalid={showValidation && badPot}
                  disabled={busy || !canReshape}
                  onChange={(event) => {
                    setShowValidation(false)
                    setPotPct(event.target.value)
                  }}
                  onBlur={() => setShowValidation(true)}
                  className="bg-background"
                />
              </DisabledReason>
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
                className="bg-background"
              />
            </div>
            {resliced ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Saving redraws every waiting level. Nothing buys until price
                reaches a level.
              </p>
            ) : null}
          </OptionCard>

          {/* The hand-set split, beside the money it divides. Editable only
              while the grid holds nothing, the same rule the range and the
              borrowing are under: redrawing a level under coins it already
              bought would leave it selling at a price it never paid. */}
          <OptionCard
            id="grid-edit-rungs"
            title="Rungs"
            foldWhenOff={false}
            toggle={{
              checked: manualOn,
              disabled: busy || !canReshape,
              onChange: (next) => {
                setShowValidation(false)
                setManualOn(next)
              },
            }}
            summary={
              manualOn
                ? `${rungs.length} rungs · ${Math.round(rungSum * 100) / 100}%`
                : null
            }
            hint={
              canReshape
                ? `Each rung takes its own share of the money, as a percent of Share of account %. The total is whatever you type. Rung 1 is the first ${entryWord(plan.direction)}.`
                : "The split can change only while the grid holds no coin — re-sizing under held coins would mis-price their sells."
            }
          >
            {rungs.map((rung, index) => {
              // The rows run down the range; the NUMBER counts outward from
              // the market, so it runs the other way on a selling grid.
              const number = gridRowRungNumber(
                index,
                rungs.length,
                plan.direction
              )
              const pct = Number(rung.value)
              const dollars =
                Number.isFinite(pct) && pct > 0 ? (potNow * pct) / 100 : null
              return (
                <div key={rung.id} className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs text-muted-foreground">
                    {number}
                  </span>
                  <div className="flex w-24 items-center gap-2">
                    <Input
                      id={`grid-edit-rung-${number}`}
                      inputMode="decimal"
                      value={rung.value}
                      disabled={busy || !canReshape}
                      aria-label={`Rung ${number}, percent of the grid's money`}
                      aria-invalid={showValidation && !(pct > 0 && pct <= 100)}
                      onChange={(event) => setRung(rung.id, event.target.value)}
                      onBlur={() => setShowValidation(true)}
                      className="min-w-0 bg-background"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {/* The money, the way the DCA ladder's rows say it. The
                      price is on the chart, where prices live. */}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                    {dollars === null ? "—" : formatUsd(dollars)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    disabled={
                      busy || !canReshape || rungs.length <= MIN_GRID_LEVELS
                    }
                    aria-label={`Remove rung ${number}`}
                    onClick={() => removeRung(rung.id)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              )
            })}
            {/* The total is information, not a rule: the rows can add up to
                whatever was typed, and the grid uses exactly that share of
                the money. Tyler's rule, 1 Sep 2026. */}
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Adds up to</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(rungSum * 100) / 100}%
                {` · ${formatUsd((potNow * rungSum) / 100)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={
                  busy || !canReshape || rungs.length >= MAX_GRID_LEVELS
                }
                onClick={addRung}
              >
                <PlusIcon className="size-4" />
                Add rung
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !canReshape || rungs.length < MIN_GRID_LEVELS}
                onClick={evenSplit}
              >
                Even split
              </Button>
            </div>
          </OptionCard>

          <OptionCard
            id="grid-end-on"
            title="End Grid"
            hint={`Reaching End Grid closes the grid and ${exitSide(plan.direction)}s back anything it still holds.`}
            summary={
              endOn
                ? `${plan.direction === "long" ? "+" : "−"}${endPct}%`
                : null
            }
            foldWhenOff={false}
            toggle={{
              checked: endOn,
              disabled: busy,
              onChange: (next) => {
                setShowValidation(false)
                setEndTouched(true)
                setEndOn(next)
              },
            }}
          >
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
                    className="bg-background"
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
          </OptionCard>

          <OptionCard
            id="grid-edit-following"
            title="Following"
            summary={
              plan.shifts === 0 && plan.downShifts === 0
                ? "Not moved"
                : `${plan.shifts} up · ${plan.downShifts} down`
            }
          >
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
          </OptionCard>

          <OptionCard
            id="grid-edit-stop"
            title="Stop loss"
            hint="The stop stays beyond the losing end of the range and ends the grid if price reaches it."
            summary={`${plan.direction === "long" ? "−" : "+"}${underPct}%`}
          >
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
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  {restsAt === null
                    ? `The ${edgeWord} of the range is ${formatPrice(lossPx)}.`
                    : `Rests at ${formatPrice(restsAt)}, ${plan.direction === "long" ? "under" : "over"} the range's ${edgeWord} of ${formatPrice(lossPx)}.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="grid-stop-reverse"
                  checked={reverseOn}
                  disabled={busy}
                  onCheckedChange={(next) => {
                    setShowValidation(false)
                    setReverseOn(next === true)
                  }}
                />
                <FieldLabel
                  htmlFor="grid-stop-reverse"
                  hint="When the stop fires, a grid running the other way is placed over the same range: its stop on the End Grid line, its End Grid the same distance past the fired stop as the stop sits past the range. The new grid starts with this switch off. Needs End Grid switched on."
                >
                  Reverse on stop loss
                </FieldLabel>
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
          </OptionCard>
        </div>
      </ScrollArea>

      {/* Below the scroll like the right-click Grid order window, so a long
          form never moves the refusal or Save button off screen. */}
      <div className="border-t p-3">
        <OrderRefusal id="grid-stop-refusal" className="pb-3">
          {showValidation ? refusal : null}
        </OrderRefusal>
        <Button
          type="button"
          className="w-full"
          aria-describedby={
            showValidation && refusal ? "grid-stop-refusal" : undefined
          }
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </>
  )
}
