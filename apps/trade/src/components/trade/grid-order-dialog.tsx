import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import { OptionCard } from "@/components/trade/option-card"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  freshGridPrefs,
  knownGridPrefs,
  rememberGridPrefs,
} from "@/lib/trade/smart-prefs-cache"
import { type MarketRow } from "@/lib/protocols/contracts"
import {
  baseStopDetection,
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
} from "@/lib/trade/dca"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { marketLeverageLimit } from "@/lib/trade/leverage"
import { BUY_BUTTON } from "@/lib/trade/money-tone"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  DEFAULT_GRID_TAKE_PROFIT_PCT,
  defaultGridParams,
  entrySide,
  gridEndPx,
  gridLiquidationPx,
  gridOrderPlan,
  placeGridParamsSchema,
  gridRangeFromClick,
  gridStopBeyond,
  reachedEntry,
  readyWhen,
  GRID_ANCHOR_HINTS,
  GRID_ANCHOR_LABELS,
  GRID_ANCHORS,
  GRID_DIRECTION_HINTS,
  GRID_DIRECTION_PICKER_LABELS,
  GRID_DIRECTIONS,
  GRID_SPACING_HINT,
  GRID_SPACING_LABELS,
  GRID_SPACINGS,
  GRID_STEP_FEE_MULTIPLE,
  MAX_GRID_LEVELS,
  MIN_GRID_LEVELS,
  type GridAnchor,
  type GridDirection,
  type PlaceGridParams,
  type GridSpacing,
} from "@/lib/trade/grid"

/**
 * The grid window the Smart order menu opens, floating at the level clicked.
 *
 * Where the range sits is the first thing it asks. Around today's price, or
 * under the price that was right-clicked, where the click is the top buy.
 * Placing either shape buys nothing. Everything else is the grid's shape: how
 * deep, how many levels, how the money is split between them, and the stop that
 * ends it if the range fails.
 *
 * Percentages die here. What is placed is concrete prices and sizes, and the
 * numbers shown come from the same `gridOrderPlan` the server derives them
 * from, so what is shown is what is placed.
 */

export type GridOrderState = { px: number; x: number; y: number }

/**
 * One line the chart draws while the window is open.
 *
 * A PRICE, not a level. On an evenly spread grid a level's sell price is the
 * next level's buy price, so sending one line per buy and one per sell drew two
 * dashed lines on top of each other at every price inside the range.
 */
export type GridPreviewLine = {
  px: number
  /** What this line is, which decides its colour and its name. */
  kind: "level" | "upper" | "lower" | "takeProfit" | "stopLoss"
}

/**
 * The whole preview: the lines, and which way round the grid being set up
 * runs.
 *
 * The direction belongs to the preview rather than to each line, because it is
 * one choice for the window and the chart needs it to colour a level in the
 * trade it would open with.
 */
export type GridPreview = {
  direction: GridDirection
  lines: GridPreviewLine[]
}

const PANEL_WIDTH = 304
const PANEL_HEIGHT = 560
const MIN_PANEL_HEIGHT = 260

/** A number field as typed, and what it parses to. */
function parsed(value: string): number | null {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) ? n : null
}

export function GridOrderDialog({
  state,
  wide = true,
  market,
  wallet,
  equity,
  free,
  takerFeeRate,
  busy,
  pairedWithLadder = false,
  pairedLeverage = null,
  positionLeverage = null,
  onPreview,
  onPlace,
  onClose,
}: {
  state: GridOrderState
  wide?: boolean
  market: MarketRow
  /** The wallet this grid will live in. */
  wallet: string
  /** What the account is worth — the pot the share is cut from. */
  equity: number
  /** Cash not already behind something — what the grid must fit inside. */
  free: number
  /** One side of a round trip, for the "does the step clear the fee" check. */
  takerFeeRate: number
  busy: boolean
  /**
   * A DCA ladder is already working this coin, so placing the grid pairs
   * the two. The window then says out loud what they will share.
   */
  pairedWithLadder?: boolean
  /** The borrowing already fixed by a DCA ladder sharing this position. */
  pairedLeverage?: number | null
  /** The borrowing already fixed by a position held in this wallet. */
  positionLeverage?: number | null
  /** The levels as edited, live — the chart draws them as faint lines. */
  onPreview: (preview: GridPreview | null) => void
  onPlace: (input: {
    topPx: number
    bottomPx: number
    params: PlaceGridParams
  }) => Promise<boolean>
  onClose: () => void
}) {
  // ----- The settings, remembered server-side ----------------------------

  // The window opens ON the last-known settings — the copy the browser kept
  // from the last read or placement — and falls back to the defaults only
  // before either has ever happened. A fresh read still runs behind it, but
  // because it almost always answers with the same values the fields were
  // seeded with, nothing on screen moves. Opening on defaults and swapping
  // when the read landed made the range choice visibly snap a second in.
  const [seeded] = React.useState(knownGridPrefs)
  const [showValidation, setShowValidation] = React.useState(false)
  // A hand that has already touched a field beats the read either way,
  // because a form must never change under somebody typing into it.
  const edited = React.useRef(false)
  const touched = React.useCallback(
    <A extends unknown[]>(set: (...args: A) => void) =>
      (...args: A) => {
        edited.current = true
        setShowValidation(false)
        set(...args)
      },
    []
  )
  const [direction, setDirection] = React.useState<GridDirection>(
    seeded?.direction ?? defaultGridParams().direction
  )
  const [levels, setLevels] = React.useState(
    String(seeded?.levels ?? defaultGridParams().levels)
  )
  const [potPct, setPotPct] = React.useState(
    String(seeded?.potPct ?? defaultGridParams().potPct)
  )
  const [chosenLeverage, setChosenLeverage] = React.useState(
    String(seeded?.leverage ?? defaultGridParams().leverage)
  )
  const fixedLeverage = positionLeverage ?? pairedLeverage
  const leverage =
    fixedLeverage === null ? chosenLeverage : String(fixedLeverage)
  const [maxOrderVolPct, setMaxOrderVolPct] = React.useState(
    seeded ? String(seeded.maxOrderVolPct) : "0"
  )
  const [spacing, setSpacing] = React.useState<GridSpacing>(
    seeded?.spacing ?? "even"
  )
  const [anchor, setAnchor] = React.useState<GridAnchor>(
    seeded?.anchor ?? "price"
  )
  const [follow, setFollow] = React.useState(seeded?.follow ?? false)
  const [followDown, setFollowDown] = React.useState(
    seeded?.followDown ?? false
  )
  // The range STRADDLES the price: levels above it are sells of what the grid
  // holds, levels below are buys waiting for a dip, and the grid earns from
  // price crossing back and forth between them.
  //
  // Set as two PERCENTAGES of the price, not two prices. A percentage means the
  // same thing on the next coin you open — "8% either side" is a grid you can
  // picture — while a price is only meaningful on the coin it came from, and
  // was remembered onto charts where it was nonsense.
  const [abovePct, setAbovePct] = React.useState(
    String(seeded?.abovePct ?? DEFAULT_GRID_ABOVE_PCT)
  )
  const [belowPct, setBelowPct] = React.useState(
    String(seeded?.rangePct ?? DEFAULT_GRID_BELOW_PCT)
  )
  const [tpOn, setTpOn] = React.useState(
    seeded ? seeded.takeProfitPct !== null : true
  )
  const [tpPct, setTpPct] = React.useState(
    String(
      seeded?.takeProfitPct ??
        defaultGridParams().takeProfitPct ??
        DEFAULT_GRID_TAKE_PROFIT_PCT
    )
  )
  const [slUnderPct, setSlUnderPct] = React.useState(
    String(
      seeded?.stopLoss?.underPct ?? defaultGridParams().stopLoss?.underPct ?? 5
    )
  )
  const [baseOn, setBaseOn] = React.useState(
    seeded ? seeded.stopLoss?.base != null : false
  )
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(seeded?.stopLoss?.base?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(
      seeded?.stopLoss?.base?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS
    )
  )

  React.useEffect(() => {
    let stale = false
    void freshGridPrefs().then((params) => {
      // A field already typed into is never overwritten — the remembered
      // settings lost the race and the hand wins. Values equal to what the
      // fields were seeded with change nothing on screen.
      if (stale || !params || edited.current) return
      setDirection(params.direction)
      setLevels(String(params.levels))
      setPotPct(String(params.potPct))
      setChosenLeverage(String(params.leverage))
      setMaxOrderVolPct(String(params.maxOrderVolPct))
      setSpacing(params.spacing)
      setAnchor(params.anchor)
      setFollow(params.follow)
      setFollowDown(params.followDown)
      setAbovePct(String(params.abovePct))
      setBelowPct(String(params.rangePct))
      setTpOn(params.takeProfitPct !== null)
      if (params.takeProfitPct !== null) setTpPct(String(params.takeProfitPct))
      if (params.stopLoss) {
        setSlUnderPct(String(params.stopLoss.underPct))
        setBaseOn(params.stopLoss.base !== null)
        if (params.stopLoss.base) {
          setBaseUnderPct(String(params.stopLoss.base.underPct))
          setBaseReclaimDays(String(params.stopLoss.base.reclaimDays))
        }
      }
    })
    return () => {
      stale = true
    }
    // Deliberately once: re-running it would overwrite what is being typed.
  }, [])

  // ----- The honest arithmetic, live -------------------------------------

  // The two ends as prices. Worked out here and nowhere else, so what the
  // summary counts, what the chart previews and what the server is sent are the
  // same numbers.
  const above = parsed(abovePct)
  const below = parsed(belowPct)
  const levelCount = parsed(levels)
  const borrowing = parsed(leverage)
  const maxBorrowing = marketLeverageLimit(market.maxLeverage)
  const borrowingInvalid =
    borrowing === null ||
    !Number.isInteger(borrowing) ||
    borrowing < 1 ||
    borrowing > maxBorrowing

  // Hanging off a click reads ONE depth, and which of the two fields holds it
  // depends on the direction: a buying grid reaches DOWN from the click, a
  // selling grid reaches UP.
  const clickDepth = direction === "long" ? below : above

  const range = React.useMemo(() => {
    // Hanging off the click solves the far edge BACKWARDS from it, so the
    // clicked price gets its own level. `gridRangeFromClick` owns that
    // algebra, and the reason it is not simply "edge = click" is written there.
    if (anchor === "click") {
      const depth = direction === "long" ? below : above
      return depth === null || levelCount === null
        ? null
        : gridRangeFromClick({
            clickPx: state.px,
            rangePct: depth,
            levels: levelCount,
            spacing,
            direction,
          })
    }
    if (above === null || below === null || !(market.price > 0)) return null
    return {
      topPx: market.price * (1 + above / 100),
      bottomPx: market.price * (1 - below / 100),
    }
  }, [
    anchor,
    direction,
    above,
    below,
    levelCount,
    spacing,
    state.px,
    market.price,
  ])

  const top = range?.topPx ?? null
  const bottom = range?.bottomPx ?? null

  const params = React.useMemo((): PlaceGridParams | null => {
    const candidate: PlaceGridParams = {
      direction,
      levels: parsed(levels) ?? -1,
      potPct: parsed(potPct) ?? -1,
      // A grid placed by hand is sized once, off the account right now.
      compound: true,
      leverage: borrowing ?? -1,
      maxOrderVolPct: parsed(maxOrderVolPct) ?? -1,
      spacing,
      sizing: "even",
      anchor,
      follow,
      followDown,
      // Remembered as depths, so the next grid on another coin opens at the
      // same shape rather than at this coin's prices.
      //
      // Hanging off the click reads only ONE of these — the depth away from
      // the click, which is below for a buying grid and above for a selling
      // one. A leftover from a bad typing session in the other field must not
      // block a grid that no longer looks at it.
      abovePct:
        anchor === "click" && direction === "long"
          ? (above ?? DEFAULT_GRID_ABOVE_PCT)
          : (above ?? -1),
      rangePct:
        anchor === "click" && direction === "short"
          ? (below ?? DEFAULT_GRID_BELOW_PCT)
          : (below ?? -1),
      baseDetection: baseStopDetection(),
      takeProfitPct: tpOn ? (parsed(tpPct) ?? -1) : null,
      stopLoss: {
        underPct: parsed(slUnderPct) ?? -1,
        base: baseOn
          ? {
              underPct: parsed(baseUnderPct) ?? -1,
              reclaimDays: parsed(baseReclaimDays) ?? -1,
            }
          : null,
      },
    }
    const checked = placeGridParamsSchema.safeParse(candidate)
    return checked.success ? checked.data : null
  }, [
    direction,
    levels,
    potPct,
    borrowing,
    maxOrderVolPct,
    spacing,
    anchor,
    follow,
    followDown,
    above,
    below,
    tpOn,
    tpPct,
    slUnderPct,
    baseOn,
    baseUnderPct,
    baseReclaimDays,
  ])

  const plan = React.useMemo(
    () =>
      params && top !== null && bottom !== null && top > bottom && bottom > 0
        ? gridOrderPlan({
            topPx: top,
            bottomPx: bottom,
            equity,
            params,
            sizeDecimals: market.sizeDecimals,
            volume24hUsd: market.volume24hUsd,
          })
        : null,
    [params, top, bottom, equity, market.sizeDecimals, market.volume24hUsd]
  )
  const marginNeeded =
    plan !== null && borrowing !== null ? plan.totalCost / borrowing : null

  // The preview dies with the window, whichever way it closes.
  React.useEffect(() => () => onPreview(null), [onPreview])

  // Levels price has not passed yet. They trade nothing now: each one waits for
  // price to go by and come back, and then opens at its own price.
  const dormant =
    plan?.levels.filter((one) => !readyWhen(direction, market.price, one.buyPx))
      .length ?? 0

  const takeProfitPct = parsed(tpPct)
  const takeProfitPx =
    tpOn &&
    top !== null &&
    bottom !== null &&
    bottom > 0 &&
    market.price > 0 &&
    takeProfitPct !== null &&
    takeProfitPct > 0
      ? gridEndPx(
          direction,
          { topPx: top, bottomPx: bottom },
          market.price,
          takeProfitPct
        )
      : null

  const stopPx =
    top !== null && bottom !== null && bottom > 0
      ? gridStopBeyond(
          direction,
          { topPx: top, bottomPx: bottom },
          parsed(slUnderPct) ?? 0
        )
      : null

  React.useEffect(() => {
    if (!plan) {
      onPreview(null)
      return
    }
    // Every price a level sits at, then the two ends of the range and the two
    // ways out. One end of the range IS the deepest level's own price — the
    // bottom on a buying grid, the top on a selling one — so that one is drawn
    // once, as the range. Levels are ordered lowest price first either way.
    const skip = direction === "long" ? 0 : plan.levels.length - 1
    const lines: GridPreviewLine[] = plan.levels
      .filter((_, index) => index !== skip)
      .map((level) => ({ px: level.buyPx, kind: "level" as const }))
    if (top !== null) lines.push({ px: top, kind: "upper" })
    if (bottom !== null) lines.push({ px: bottom, kind: "lower" })
    if (takeProfitPx !== null)
      lines.push({ px: takeProfitPx, kind: "takeProfit" })
    if (stopPx !== null) lines.push({ px: stopPx, kind: "stopLoss" })
    onPreview({ direction, lines })
  }, [plan, direction, onPreview, top, bottom, takeProfitPx, stopPx])

  /**
   * Would the exchange close this short out before the stop was reached?
   *
   * The same arithmetic and the same worst case the server refuses on, so the
   * window says no before the button is pressed rather than after. A buying
   * grid cannot hit this: its worst case is bounded by zero.
   */
  const stopPastLiquidation =
    direction === "short" &&
    plan !== null &&
    stopPx !== null &&
    borrowing !== null &&
    (() => {
      const liq = gridLiquidationPx({
        direction,
        levels: plan.levels,
        leverage: borrowing,
        maxLeverage: market.maxLeverage ?? 1,
      })
      return liq !== null && reachedEntry(direction, stopPx, liq)
    })()

  // Every refusal the server would give, in the same order and wording as the
  // server. It appears after a bad field loses focus or Place is pressed.
  const refusal =
    top === null || bottom === null || !(top > 0) || !(bottom > 0)
      ? anchor === "click"
        ? `Set how far ${direction === "long" ? "below" : "above"} your click the grid reaches, and between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} levels.`
        : "Both ends of the range need to be a percentage above zero."
      : bottom >= top
        ? "The bottom of the grid has to be below the top."
        : borrowingInvalid
          ? `Borrowing must be a whole number from 1× to ${maxBorrowing}× on this market.`
          : !params
            ? `Something here does not make sense yet — between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} levels, and a share above zero.`
            : plan && plan.stepPct <= takerFeeRate * GRID_STEP_FEE_MULTIPLE
              ? "Those levels sit too close together to clear the trading fee — each round trip would lose money. Use a wider range or fewer levels."
              : plan && plan.tooSmallIndex !== null
                ? `Level ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer levels or a bigger share.`
                : marginNeeded !== null && marginNeeded > free
                  ? `The grid needs ${formatUsd(marginNeeded)} of margin but only ${formatUsd(free)} is free — nothing would fit.`
                  : stopPastLiquidation
                    ? "The exchange would close this short out before the stop was reached, so the stop would never fire. Move the stop closer to the range, use less borrowing, use a smaller share of the account, or use fewer levels."
                    : null

  const ready = !busy && refusal === null && plan !== null

  const submit = async () => {
    if (busy) return
    if (!ready || !params || top === null || bottom === null) {
      setShowValidation(true)
      if (refusal) showErrorToast(refusal)
      return
    }
    const placed = await onPlace({ topPx: top, bottomPx: bottom, params })
    // The server remembers these on placing; the browser's copy keeps the
    // next window from opening on anything older.
    if (placed) rememberGridPrefs(params)
    if (placed) onClose()
  }

  // The deepest level: the bottom of the range on a buying grid, the top on a
  // selling one. Its money is the figure the summary shows.
  const deepest =
    plan?.levels[direction === "long" ? 0 : plan.levels.length - 1]
  const deepestUsd = deepest?.dollars ?? null
  const deepestMargin =
    deepestUsd === null || borrowing === null ? null : deepestUsd / borrowing
  return (
    <FloatingOrderWindow
      label={`Grid on ${market.symbol}`}
      wide={wide}
      openedAt={state}
      width={PANEL_WIDTH}
      height={PANEL_HEIGHT}
      minimumHeight={MIN_PANEL_HEIGHT}
      title="Grid"
      wallet={wallet}
      free={free}
      onClose={onClose}
    >
      <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
        <div className="grid gap-4 p-3">
          <OptionCard
            id="grid-range"
            title="Range"
            hint={
              direction === "long"
                ? "Where the grid works, and how many buys it is split into. Each buy sells one step above itself."
                : "Where the grid works, and how many sells it is split into. Each sell buys back one step below itself."
            }
            summary={
              anchor === "click"
                ? clickDepth === null
                  ? "—"
                  : direction === "long"
                    ? `−${belowPct}%`
                    : `+${abovePct}%`
                : above === null || below === null
                  ? "—"
                  : above === below
                    ? `±${belowPct}%`
                    : `+${abovePct}% / −${belowPct}%`
            }
          >
            {/* Which way round the grid runs. The first thing the card asks,
                because every label under it changes with the answer.

                Two boxes side by side rather than one, because "Long" and
                "Short" are the words for the two things and neither reads as
                the absence of the other. Exactly one is always ticked:
                clicking the one already on does nothing, so the grid can never
                be left with no direction at all. */}
            <div className="flex items-center gap-6">
              {GRID_DIRECTIONS.map((one) => (
                <div key={one} className="flex items-center gap-2">
                  <Checkbox
                    id={`grid-direction-${one}`}
                    checked={direction === one}
                    disabled={busy}
                    onCheckedChange={touched(() => setDirection(one))}
                  />
                  <FieldLabel
                    htmlFor={`grid-direction-${one}`}
                    hint={GRID_DIRECTION_HINTS[one]}
                  >
                    {GRID_DIRECTION_PICKER_LABELS[one]}
                  </FieldLabel>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-anchor"
                hint={GRID_ANCHOR_HINTS[direction][anchor]}
              >
                Where the range sits
              </FieldLabel>
              <Select
                value={anchor}
                disabled={busy}
                onValueChange={touched((next: string) =>
                  setAnchor(next as GridAnchor)
                )}
              >
                <SelectTrigger
                  id="grid-anchor"
                  className="w-full bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_ANCHORS.map((one) => (
                    <SelectItem key={one} value={one}>
                      {GRID_ANCHOR_LABELS[direction][one]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {anchor === "click" ? (
              /* One depth, not two. The far edge is solved for so the clicked
                   price gets its own level, so there is nothing to type on
                   that side. A buying grid reaches down from the click and a
                   selling grid reaches up. */
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="grid-click-depth"
                  hint={
                    direction === "long"
                      ? "How far under the price you clicked the deepest buy sits."
                      : "How far over the price you clicked the deepest sell sits."
                  }
                >
                  {direction === "long" ? "How far below %" : "How far above %"}
                </FieldLabel>
                <Input
                  id="grid-click-depth"
                  inputMode="decimal"
                  value={direction === "long" ? belowPct : abovePct}
                  disabled={busy}
                  aria-invalid={showValidation && clickDepth === null}
                  onChange={(event) =>
                    touched(direction === "long" ? setBelowPct : setAbovePct)(
                      event.target.value
                    )
                  }
                  onBlur={() => setShowValidation(true)}
                  className="bg-background"
                />
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="grid-top" className="text-xs">
                    Above %
                  </Label>
                  <Input
                    id="grid-top"
                    inputMode="decimal"
                    value={abovePct}
                    disabled={busy}
                    aria-invalid={showValidation && above === null}
                    onChange={(event) =>
                      touched(setAbovePct)(event.target.value)
                    }
                    onBlur={() => setShowValidation(true)}
                    className="bg-background"
                  />
                </div>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="grid-bottom" className="text-xs">
                    Below %
                  </Label>
                  <Input
                    id="grid-bottom"
                    inputMode="decimal"
                    value={belowPct}
                    disabled={busy}
                    aria-invalid={showValidation && below === null}
                    onChange={(event) =>
                      touched(setBelowPct)(event.target.value)
                    }
                    onBlur={() => setShowValidation(true)}
                    className="bg-background"
                  />
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-levels"
                hint={`How many ${entrySide(direction)}s the range is split into. Each one watches its own price, so ${MAX_GRID_LEVELS} is the most.`}
              >
                Levels
              </FieldLabel>
              <Input
                id="grid-levels"
                inputMode="numeric"
                value={levels}
                disabled={busy}
                aria-invalid={showValidation && parsed(levels) === null}
                onChange={(event) => touched(setLevels)(event.target.value)}
                onBlur={() => setShowValidation(true)}
                className="bg-background"
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-pot"
                hint="The share of the account the whole grid may spend. Every level gets the same amount."
              >
                Share of account %
              </FieldLabel>
              <Input
                id="grid-pot"
                inputMode="decimal"
                value={potPct}
                disabled={busy}
                aria-invalid={showValidation && parsed(potPct) === null}
                onChange={(event) => touched(setPotPct)(event.target.value)}
                onBlur={() => setShowValidation(true)}
                className="bg-background"
              />
            </div>
            {/* A straddling grid still trades nothing at placement. Name the
                  dormant levels so that waiting state is not mistaken for an
                  immediate trade. */}
            {dormant > 0 ? (
              <p className="text-xs text-muted-foreground">
                {dormant} level{dormant === 1 ? "" : "s"} sit{" "}
                {direction === "long" ? "above" : "below"} the price. Placing
                this {entrySide(direction)}s nothing: each level waits for price
                to reach it and then {entrySide(direction)}s at its own price.
              </p>
            ) : null}
            {/* What each level puts up and what the whole grid costs. */}
            <div className="grid gap-1 text-xs text-muted-foreground">
              <div className="flex items-baseline justify-between gap-2">
                <span>Each {entrySide(direction)} controls</span>
                <span className="tabular-nums">
                  {deepestUsd === null ? "—" : formatUsd(deepestUsd)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span>Margin per {entrySide(direction)}</span>
                <span className="tabular-nums">
                  {deepestMargin === null ? "—" : formatUsd(deepestMargin)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span>Whole grid controls</span>
                <span className="tabular-nums">
                  {plan === null ? "—" : formatUsd(plan.totalCost)}
                </span>
              </div>
            </div>
          </OptionCard>

          <OptionCard
            id="grid-tp-on"
            title="End Grid"
            summary={
              tpOn
                ? parsed(tpPct) === null
                  ? "—"
                  : `${direction === "long" ? "+" : "−"}${tpPct}%`
                : null
            }
            hint={
              direction === "long"
                ? "A fixed line above the range. The grid may keep following price up, but reaching this line closes it. The line usually sells nothing because every level has already sold by then. Without the line the grid keeps working until you stop it or its stop loss is hit."
                : "A fixed line below the range. The grid may keep following price down, but reaching this line closes it. The line usually buys nothing because every level has already bought back by then. Without the line the grid keeps working until you stop it or its stop loss is hit."
            }
            foldWhenOff={false}
            toggle={{
              checked: tpOn,
              disabled: busy,
              onChange: touched(setTpOn),
            }}
          >
            {tpOn ? (
              <>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="grid-tp-pct"
                    hint={
                      direction === "long"
                        ? "Measured from today's price or the top of the grid, whichever is higher. End Grid starts above both."
                        : "Measured from today's price or the bottom of the grid, whichever is lower. End Grid starts below both."
                    }
                  >
                    {direction === "long"
                      ? "Above the higher price %"
                      : "Below the lower price %"}
                  </FieldLabel>
                  <Input
                    id="grid-tp-pct"
                    inputMode="decimal"
                    value={tpPct}
                    disabled={busy}
                    aria-invalid={showValidation && parsed(tpPct) === null}
                    onChange={(event) => touched(setTpPct)(event.target.value)}
                    onBlur={() => setShowValidation(true)}
                    className="bg-background"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>Grid ends at</span>
                  <span className="tabular-nums">
                    {takeProfitPx === null ? "—" : formatPrice(takeProfitPx)}
                  </span>
                </div>
              </>
            ) : null}
          </OptionCard>

          <OptionCard
            id="grid-sl-on"
            title="Stop loss"
            summary={
              parsed(slUnderPct) === null
                ? "—"
                : `${direction === "long" ? "−" : "+"}${slUnderPct}%`
            }
            hint={
              direction === "long"
                ? "A stop below the bottom of the range. If price cuts through it, everything held is sold and the grid is over. It hangs off the range, not off your average buy price — an average that moves as the grid recycles would drag the stop up into the range."
                : "A stop above the top of the range. If price cuts through it, the whole short is bought back and the grid is over. It hangs off the range, not off your average sell price — an average that moves as the grid recycles would drag the stop down into the range."
            }
          >
            <>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="grid-sl-pct"
                  hint={
                    direction === "long"
                      ? "How far under the bottom of the range the stop rests. Zero sits it on the bottom itself."
                      : "How far over the top of the range the stop rests. Zero sits it on the top itself."
                  }
                >
                  {direction === "long"
                    ? "Below the bottom %"
                    : "Above the top %"}
                </FieldLabel>
                <Input
                  id="grid-sl-pct"
                  inputMode="decimal"
                  value={slUnderPct}
                  disabled={busy}
                  aria-invalid={showValidation && parsed(slUnderPct) === null}
                  onChange={(event) =>
                    touched(setSlUnderPct)(event.target.value)
                  }
                  onBlur={() => setShowValidation(true)}
                  className="bg-background"
                />
              </div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>Stop sits at</span>
                <span className="tabular-nums">
                  {stopPx === null ? "—" : formatPrice(stopPx)}
                </span>
              </div>
              <BaseStopFields
                on={baseOn}
                underPct={baseUnderPct}
                reclaimDays={baseReclaimDays}
                disabled={busy}
                showErrors={showValidation}
                direction={direction}
                onOn={touched(setBaseOn)}
                onUnderPct={touched(setBaseUnderPct)}
                onReclaimDays={touched(setBaseReclaimDays)}
                onBlur={() => setShowValidation(true)}
              />
            </>
          </OptionCard>

          <OptionCard
            id="grid-advanced"
            title="Advanced settings"
            defaultOpen={false}
            footer={
              plan?.volumeCapped ? (
                <p className="text-xs text-muted-foreground">
                  The liquidity guard is shrinking some buys — the amounts above
                  show it.
                </p>
              ) : null
            }
          >
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-leverage"
                hint={
                  fixedLeverage === null
                    ? "How many dollars of coin each dollar behind the grid buys. 1 is cash. A higher choice lets the exchange close the position if it falls far enough."
                    : positionLeverage !== null
                      ? "The position already held in this wallet fixed the borrowing for this coin. Grid buys add to the same position, so they must use the same number."
                      : "The DCA ladder already fixed the borrowing for this coin. The grid shares the same exchange position, so both must use the same number."
                }
              >
                Borrowing ×
              </FieldLabel>
              <Input
                id="grid-leverage"
                inputMode="numeric"
                value={leverage}
                disabled={busy || fixedLeverage !== null}
                aria-invalid={showValidation && borrowingInvalid}
                onChange={(event) =>
                  touched(setChosenLeverage)(event.target.value)
                }
                onBlur={() => setShowValidation(true)}
                className="bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-follow"
                checked={follow}
                disabled={busy}
                onCheckedChange={touched((next: boolean | "indeterminate") =>
                  setFollow(next === true)
                )}
              />
              <FieldLabel
                htmlFor="grid-follow"
                hint={
                  direction === "long"
                    ? "When price climbs past the top, the range slides up behind it. End Grid stays fixed and closes the grid when price reaches it. Levels the same dollars apart stop following once a round trip no longer clears the fee."
                    : "Careful: this walks a selling grid towards its loss. When price climbs past the top, the range adds one new higher sell per pass. Levels already sold keep their buy-back prices, and the stop stays where it was set."
                }
              >
                Follow price up
              </FieldLabel>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="grid-follow-down"
                checked={followDown}
                disabled={busy}
                onCheckedChange={touched((next: boolean | "indeterminate") =>
                  setFollowDown(next === true)
                )}
              />
              <FieldLabel
                htmlFor="grid-follow-down"
                hint={
                  direction === "long"
                    ? "Careful: this walks a buying grid towards its loss. When price falls through the bottom, the range adds one new lower buy per pass. Filled levels above it keep their sell prices, and the stop stays where it was set."
                    : "When price falls past the bottom, the range slides down behind it. End Grid stays fixed and closes the grid when price reaches it. Levels the same dollars apart stop following once a round trip no longer clears the fee."
                }
              >
                Follow price down
              </FieldLabel>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="grid-spacing" hint={GRID_SPACING_HINT}>
                Levels spread
              </FieldLabel>
              <Select
                value={spacing}
                disabled={busy}
                onValueChange={touched((next: string) =>
                  setSpacing(next as GridSpacing)
                )}
              >
                <SelectTrigger
                  id="grid-spacing"
                  className="w-full bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_SPACINGS.map((one) => (
                    <SelectItem key={one} value={one}>
                      {GRID_SPACING_LABELS[one]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-vol-pct"
                hint="No single buy bigger than this share of the coin's last-24-hours volume, so thin coins get small orders. 0 turns it off."
              >
                Liquidity guard %
              </FieldLabel>
              <Input
                id="grid-vol-pct"
                inputMode="decimal"
                value={maxOrderVolPct}
                disabled={busy}
                aria-invalid={showValidation && parsed(maxOrderVolPct) === null}
                onChange={(event) =>
                  touched(setMaxOrderVolPct)(event.target.value)
                }
                onBlur={() => setShowValidation(true)}
                className="bg-background"
              />
            </div>
          </OptionCard>
        </div>
      </ScrollArea>

      {/* Below the scroll, not in it: however many levels the grid has, the
            refusal and the button that explains it stay on screen. */}
      <div className="border-t p-3">
        {pairedWithLadder ? (
          <p className="pb-3 text-xs text-muted-foreground">
            This coin already has a ladder. Placing this grid pairs the two: the
            grid's stop must sit above the ladder's first buy, and on the
            exchange they still share one position — one pot of margin and one
            borrowing choice and one liquidation price. If the ladder falls far
            enough, the exchange can close the grid's coins with it.
          </p>
        ) : null}
        <OrderRefusal id="grid-refusal" className="pb-3">
          {showValidation ? refusal : null}
        </OrderRefusal>
        <Button
          type="button"
          onClick={() => void submit()}
          aria-describedby={
            showValidation && refusal ? "grid-refusal" : undefined
          }
          disabled={busy}
          className={cn("w-full", BUY_BUTTON)}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {`Place${plan ? ` ${plan.levels.length}` : ""} ${entrySide(direction)}${
            plan && plan.levels.length === 1 ? "" : "s"
          }`}
        </Button>
      </div>
    </FloatingOrderWindow>
  )
}
