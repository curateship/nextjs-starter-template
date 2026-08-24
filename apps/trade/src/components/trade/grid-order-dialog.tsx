import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import { OptionCard } from "@/components/trade/option-card"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
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
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  DEFAULT_GRID_TAKE_PROFIT_PCT,
  defaultGridParams,
  gridOrderPlan,
  gridParamsSchema,
  gridRangeFromClick,
  gridStopUnder,
  GRID_ANCHOR_HINTS,
  GRID_ANCHOR_LABELS,
  GRID_ANCHORS,
  GRID_SIZING_HINTS,
  GRID_SIZING_LABELS,
  GRID_SIZINGS,
  GRID_SPACING_HINTS,
  GRID_SPACING_LABELS,
  GRID_SPACINGS,
  GRID_STEP_FEE_MULTIPLE,
  MAX_GRID_LEVELS,
  MIN_GRID_LEVELS,
  type GridAnchor,
  type GridParams,
  type GridSizing,
  type GridSpacing,
} from "@/lib/trade/grid"

/**
 * The grid window the Smart order menu opens, floating at the level clicked.
 *
 * Where the range sits is the first thing it asks. Around today's price, which
 * straddles it and buys at market on the way in to stand behind the levels
 * above. Or under the price that was right-clicked, where the click is the top
 * BUY and nothing is bought at all. Everything else is the grid's shape: how
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
  /** The levels as edited, live — the chart draws them as faint lines. */
  onPreview: (lines: GridPreviewLine[] | null) => void
  onPlace: (input: {
    topPx: number
    bottomPx: number
    params: GridParams
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
  const seeded = React.useRef(knownGridPrefs()).current
  // A hand that has already touched a field beats the read either way,
  // because a form must never change under somebody typing into it.
  const edited = React.useRef(false)
  const touched = React.useCallback(
    <A extends unknown[]>(set: (...args: A) => void) =>
      (...args: A) => {
        edited.current = true
        set(...args)
      },
    []
  )
  const [levels, setLevels] = React.useState(
    String(seeded?.levels ?? defaultGridParams().levels)
  )
  const [potPct, setPotPct] = React.useState(
    String(seeded?.potPct ?? defaultGridParams().potPct)
  )
  const [maxOrderVolPct, setMaxOrderVolPct] = React.useState(
    seeded ? String(seeded.maxOrderVolPct) : "0"
  )
  const [spacing, setSpacing] = React.useState<GridSpacing>(
    seeded?.spacing ?? "even"
  )
  const [sizing, setSizing] = React.useState<GridSizing>(
    seeded?.sizing ?? "even"
  )
  const [anchor, setAnchor] = React.useState<GridAnchor>(
    seeded?.anchor ?? "price"
  )
  const [follow, setFollow] = React.useState(seeded?.follow ?? false)
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
  // A following grid has no finish line, so a remembered one stays off.
  const [tpOn, setTpOn] = React.useState(
    seeded ? !seeded.follow && seeded.takeProfitPct !== null : true
  )
  const [tpPct, setTpPct] = React.useState(
    String(
      seeded?.takeProfitPct ??
        defaultGridParams().takeProfitPct ??
        DEFAULT_GRID_TAKE_PROFIT_PCT
    )
  )
  const [slOn, setSlOn] = React.useState(
    seeded ? seeded.stopLoss !== null : true
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
      setLevels(String(params.levels))
      setPotPct(String(params.potPct))
      setMaxOrderVolPct(String(params.maxOrderVolPct))
      setSpacing(params.spacing)
      setSizing(params.sizing)
      setAnchor(params.anchor)
      setFollow(params.follow)
      setAbovePct(String(params.abovePct))
      setBelowPct(String(params.rangePct))
      // A following grid has no finish line, so a remembered one stays off.
      setTpOn(!params.follow && params.takeProfitPct !== null)
      if (params.takeProfitPct !== null) setTpPct(String(params.takeProfitPct))
      setSlOn(params.stopLoss !== null)
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

  const range = React.useMemo(() => {
    // Hanging off the click solves the top BACKWARDS from it, so the clicked
    // price gets its own buy. `gridRangeFromClick` owns that algebra, and the
    // reason it is not simply "top = click" is written there.
    if (anchor === "click") {
      return below === null || levelCount === null
        ? null
        : gridRangeFromClick({
            clickPx: state.px,
            rangePct: below,
            levels: levelCount,
            spacing,
          })
    }
    if (above === null || below === null || !(market.price > 0)) return null
    return {
      topPx: market.price * (1 + above / 100),
      bottomPx: market.price * (1 - below / 100),
    }
  }, [anchor, above, below, levelCount, spacing, state.px, market.price])

  const top = range?.topPx ?? null
  const bottom = range?.bottomPx ?? null

  const params = React.useMemo((): GridParams | null => {
    const candidate: GridParams = {
      levels: parsed(levels) ?? -1,
      potPct: parsed(potPct) ?? -1,
      // A grid placed by hand is sized once, off the account right now.
      compound: true,
      maxOrderVolPct: parsed(maxOrderVolPct) ?? -1,
      spacing,
      sizing,
      anchor,
      follow,
      // Remembered as depths, so the next grid on another coin opens at the
      // same shape rather than at this coin's prices.
      //
      // Hanging off the click never reads the depth ABOVE, because the top is
      // solved for. A leftover from a bad typing session must not block a grid
      // that no longer looks at it.
      abovePct:
        anchor === "click" ? (above ?? DEFAULT_GRID_ABOVE_PCT) : (above ?? -1),
      rangePct: below ?? -1,
      baseDetection: baseStopDetection(),
      // A following grid has no finish line: the range slides up ahead of
      // price, so a level above it can never be reached.
      takeProfitPct: follow ? null : tpOn ? (parsed(tpPct) ?? -1) : null,
      stopLoss: slOn
        ? {
            underPct: parsed(slUnderPct) ?? -1,
            base: baseOn
              ? {
                  underPct: parsed(baseUnderPct) ?? -1,
                  reclaimDays: parsed(baseReclaimDays) ?? -1,
                }
              : null,
          }
        : null,
    }
    const checked = gridParamsSchema.safeParse(candidate)
    return checked.success ? checked.data : null
  }, [
    levels,
    potPct,
    maxOrderVolPct,
    spacing,
    sizing,
    anchor,
    follow,
    above,
    below,
    tpOn,
    tpPct,
    slOn,
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

  // The preview dies with the window, whichever way it closes.
  React.useEffect(() => () => onPreview(null), [onPreview])

  // Levels above today's price. They buy nothing now: each one waits for price
  // to climb past it and come back down, and then buys at its own price.
  const waitingAbove =
    plan?.levels.filter((one) => one.buyPx >= market.price).length ?? 0

  const takeProfitPx =
    !follow && tpOn && top !== null && top > 0
      ? top * (1 + (parsed(tpPct) ?? 0) / 100)
      : null

  const stopPx =
    slOn && bottom !== null && bottom > 0
      ? gridStopUnder(bottom, parsed(slUnderPct) ?? 0)
      : null

  React.useEffect(() => {
    if (!plan) {
      onPreview(null)
      return
    }
    // Every distinct price the grid would use: one per level's buy, plus the
    // top, which is the shallowest level's sell and the end of the range.
    // Every price a level sits at, then the two ends of the range and the two
    // ways out. The deepest level IS the lower price and the shallowest sell IS
    // the upper price, so those two are drawn once, as the range.
    const lines: GridPreviewLine[] = plan.levels
      .slice(1)
      .map((level) => ({ px: level.buyPx, kind: "level" as const }))
    if (top !== null) lines.push({ px: top, kind: "upper" })
    if (bottom !== null) lines.push({ px: bottom, kind: "lower" })
    if (takeProfitPx !== null)
      lines.push({ px: takeProfitPx, kind: "takeProfit" })
    if (stopPx !== null) lines.push({ px: stopPx, kind: "stopLoss" })
    onPreview(lines)
  }, [plan, onPreview, top, bottom, takeProfitPx, stopPx])

  /**
   * The most levels doubling can actually fit with this money.
   *
   * Found by asking the planner, not by arithmetic on paper, so the market's
   * own minimum order and its size step are part of the answer rather than
   * something the answer is later wrong about.
   *
   * Only worked out once a doubled grid has already been refused, because it is
   * the one number that helps: each level down needs twice the one above, so
   * twelve levels need 4,095 times the smallest buy and no realistic share of
   * an account closes that gap. Dropping one level halves what is needed.
   */
  const doublingFits = React.useMemo(() => {
    if (sizing !== "double") return null
    if (!params || !plan || plan.tooSmallIndex === null) return null
    if (top === null || bottom === null) return null
    for (let count = params.levels - 1; count >= MIN_GRID_LEVELS; count -= 1) {
      const tried = gridOrderPlan({
        topPx: top,
        bottomPx: bottom,
        equity,
        params: { ...params, levels: count },
        sizeDecimals: market.sizeDecimals,
        volume24hUsd: market.volume24hUsd,
      })
      if (tried.tooSmallIndex === null) return count
    }
    return null
  }, [
    sizing,
    params,
    plan,
    top,
    bottom,
    equity,
    market.sizeDecimals,
    market.volume24hUsd,
  ])

  // Every refusal the server would give, said here first so nobody presses
  // Place to find out. Same order and same wording as the server's.
  const refusal =
    top === null || bottom === null || !(top > 0) || !(bottom > 0)
      ? anchor === "click"
        ? `Set how far below your click the grid reaches, and between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} levels.`
        : "Both ends of the range need to be a percentage above zero."
      : bottom >= top
        ? "The bottom of the grid has to be below the top."
        : !params
          ? `Something here does not make sense yet — between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} levels, and a share above zero.`
          : plan && plan.stepPct <= takerFeeRate * GRID_STEP_FEE_MULTIPLE
            ? "Those levels sit too close together to clear the trading fee — each round trip would lose money. Use a wider range or fewer levels."
            : plan && plan.tooSmallIndex !== null
              ? sizing === "double"
                ? doublingFits === null
                  ? `Doubling makes level ${plan.tooSmallIndex + 1} too small to trade here. There is not enough in the account for a doubled grid on this market, at any number of levels. Set the split back to the same at every level.`
                  : `Doubling makes level ${plan.tooSmallIndex + 1} too small to trade here. With this much money it fits ${doublingFits} levels. A bigger share barely helps: each level down needs twice the one above it, so one level fewer halves what the grid needs.`
                : `Level ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer levels or a bigger share.`
              : plan && plan.totalCost > free
                ? `The grid costs ${formatUsd(plan.totalCost)} but only ${formatUsd(free)} is free — nothing would fit.`
                : null

  const ready = !busy && refusal === null && plan !== null

  const submit = async () => {
    if (!ready || !params || top === null || bottom === null) return
    const placed = await onPlace({ topPx: top, bottomPx: bottom, params })
    // The server remembers these on placing; the browser's copy keeps the
    // next window from opening on anything older.
    if (placed) rememberGridPrefs(params)
    if (placed) onClose()
  }

  // Index 0 is the bottom of the range, which doubling makes the biggest buy.
  const bottomBuy = plan?.levels[0]?.dollars ?? null
  const topBuy = plan?.levels.at(-1)?.dollars ?? null
  const stepUsd =
    plan && plan.levels.length > 0
      ? plan.levels[0].sellPx - plan.levels[0].buyPx
      : null

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
          {/* Where the price is right now, said out loud. The whole range has
                to sit under it, and a window that only told you afterwards
                would be a window you had to guess at. */}
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Price now</span>
            <span className="font-medium tabular-nums">
              {formatPrice(market.price)}
            </span>
          </div>

          <OptionCard
            id="grid-range"
            title="Range"
            hint="Where the grid works, and how many buys it is split into. Each buy sells one step above itself."
            summary={
              anchor === "click"
                ? below === null
                  ? "—"
                  : `−${belowPct}%`
                : above === null || below === null
                  ? "—"
                  : above === below
                    ? `±${belowPct}%`
                    : `+${abovePct}% / −${belowPct}%`
            }
          >
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-anchor"
                hint={GRID_ANCHOR_HINTS[anchor]}
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
                      {GRID_ANCHOR_LABELS[one]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {anchor === "click" ? (
              /* One depth, not two. The top is solved for so the clicked
                   price gets its own buy, so there is nothing to type above. */
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="grid-bottom"
                  hint="How far under the price you clicked the deepest buy sits."
                >
                  How far below %
                </FieldLabel>
                <Input
                  id="grid-bottom"
                  inputMode="decimal"
                  value={belowPct}
                  disabled={busy}
                  aria-invalid={below === null}
                  onChange={(event) => touched(setBelowPct)(event.target.value)}
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
                    aria-invalid={above === null}
                    onChange={(event) =>
                      touched(setAbovePct)(event.target.value)
                    }
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
                    aria-invalid={below === null}
                    onChange={(event) =>
                      touched(setBelowPct)(event.target.value)
                    }
                    className="bg-background"
                  />
                </div>
              </div>
            )}
            {/* Where those percentages actually land, so the range can be
                  checked against the chart without doing the sums. */}
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span>Range</span>
              <span className="tabular-nums">
                {bottom === null || top === null
                  ? "—"
                  : `${formatPrice(bottom)} – ${formatPrice(top)}`}
              </span>
            </div>
            {anchor === "click" ? (
              /* The one number this mode promises. The top of the range is a
                   step above it and is not a buy, which is worth saying out
                   loud on the window rather than only in the code. */
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>Top buy, where you clicked</span>
                <span className="tabular-nums">{formatPrice(state.px)}</span>
              </div>
            ) : null}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-levels"
                hint={`How many buys the range is split into. Each one rests its own order, so ${MAX_GRID_LEVELS} is the most.`}
              >
                Levels
              </FieldLabel>
              <Input
                id="grid-levels"
                inputMode="numeric"
                value={levels}
                disabled={busy}
                aria-invalid={parsed(levels) === null}
                onChange={(event) => touched(setLevels)(event.target.value)}
                className="bg-background"
              />
            </div>
            {/* What the straddle means in plain numbers: how much it buys
                  the moment you press Place, and how much waits below. */}
            {waitingAbove > 0 ? (
              <p className="text-xs text-muted-foreground">
                {waitingAbove} level{waitingAbove === 1 ? "" : "s"} sit above
                the price. Placing this buys nothing: each level waits for price
                to reach it and then buys at its own price.
              </p>
            ) : null}
            {/* The two numbers that decide whether this is worth running:
                  what one round trip is worth, and what each buy spends. */}
            <div className="grid gap-1 text-xs text-muted-foreground">
              <div className="flex items-baseline justify-between gap-2">
                <span>Step between levels</span>
                <span className="tabular-nums">
                  {stepUsd === null ? "—" : formatPrice(stepUsd)}
                </span>
              </div>
              {sizing === "double" ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span>Top buy spends</span>
                    <span className="tabular-nums">
                      {topBuy === null ? "—" : formatUsd(topBuy)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span>Bottom buy spends</span>
                    <span className="tabular-nums">
                      {bottomBuy === null ? "—" : formatUsd(bottomBuy)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <span>Each buy spends</span>
                  <span className="tabular-nums">
                    {bottomBuy === null ? "—" : formatUsd(bottomBuy)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span>Whole grid</span>
                <span className="tabular-nums">
                  {plan === null ? "—" : formatUsd(plan.totalCost)}
                </span>
              </div>
            </div>
          </OptionCard>

          <OptionCard
            id="grid-money"
            title="Money"
            hint="The share of the account the whole grid may spend, and how that share is split between the levels. Whatever a level is given, it spends the same amount cycle after cycle."
            summary={plan === null ? "—" : formatUsd(plan.totalCost)}
          >
            <div className="grid gap-2">
              <Label htmlFor="grid-pot" className="text-xs">
                Share of account %
              </Label>
              <Input
                id="grid-pot"
                inputMode="decimal"
                value={potPct}
                disabled={busy}
                aria-invalid={parsed(potPct) === null}
                onChange={(event) => touched(setPotPct)(event.target.value)}
                className="bg-background"
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="grid-sizing"
                hint={GRID_SIZING_HINTS[sizing]}
              >
                Split between levels
              </FieldLabel>
              <Select
                value={sizing}
                disabled={busy}
                onValueChange={touched((next: string) =>
                  setSizing(next as GridSizing)
                )}
              >
                <SelectTrigger
                  id="grid-sizing"
                  className="w-full bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_SIZINGS.map((one) => (
                    <SelectItem key={one} value={one}>
                      {GRID_SIZING_LABELS[one]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </OptionCard>

          <OptionCard
            id="grid-follow"
            title="Follow price up"
            hint="When price climbs past the top, the range slides up behind it and the grid carries on. It costs nothing, because by then every level has already sold. The stop slides up too, so it keeps what it has made, and it never finishes on its own: it runs until you switch this off or the stop is hit. Levels the same dollars apart thin as the range climbs, so following stops once a round trip no longer clears the fee. The same percent apart has no such limit."
            toggle={{
              checked: follow,
              disabled: busy,
              onChange: touched((next: boolean) => {
                setFollow(next)
                // A range that slides up ahead of price can never reach a
                // line above it, so the finish line goes with it rather than
                // sitting there looking like an exit.
                if (next) setTpOn(false)
              }),
            }}
          >
            {/* Nothing to fold open. Following has no numbers of its own, and
                  everything there is to say about it is on the tooltip beside
                  the title, where it does not take up the window. */}
            {null}
          </OptionCard>

          {/* Hidden entirely while the grid follows price. A line above a
                range that slides up ahead of price can never be reached, and a
                setting that quietly does nothing is worse than no setting. */}
          {follow ? null : (
            <OptionCard
              id="grid-tp-on"
              title="Finish the grid"
              summary={
                tpOn ? (parsed(tpPct) === null ? "—" : `+${tpPct}%`) : null
              }
              hint="How far above the range price has to get before the grid closes itself. It rarely sells anything: by the time price is up there every level has already sold, so what this really does is stop the grid watching. Without it the grid waits above its range for price to come back down."
              toggle={{
                checked: tpOn,
                disabled: busy,
                onChange: touched(setTpOn),
              }}
            >
              {tpOn ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="grid-tp-pct" className="text-xs">
                      Above the top %
                    </Label>
                    <Input
                      id="grid-tp-pct"
                      inputMode="decimal"
                      value={tpPct}
                      disabled={busy}
                      aria-invalid={parsed(tpPct) === null}
                      onChange={(event) =>
                        touched(setTpPct)(event.target.value)
                      }
                      className="bg-background"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>Grid finishes at</span>
                    <span className="tabular-nums">
                      {takeProfitPx === null ? "—" : formatPrice(takeProfitPx)}
                    </span>
                  </div>
                </>
              ) : null}
            </OptionCard>
          )}

          <OptionCard
            id="grid-sl-on"
            title="Stop loss"
            summary={
              slOn
                ? parsed(slUnderPct) === null
                  ? "—"
                  : `−${slUnderPct}%`
                : null
            }
            hint="A stop below the bottom of the range. If price cuts through it, everything held is sold and the grid is over. It hangs off the range, not off your average buy price — an average that moves as the grid recycles would drag the stop up into the range."
            toggle={{
              checked: slOn,
              disabled: busy,
              onChange: touched(setSlOn),
            }}
          >
            {slOn ? (
              <>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="grid-sl-pct"
                    hint="How far under the bottom of the range the stop rests. Zero sits it on the bottom itself."
                  >
                    Below the bottom %
                  </FieldLabel>
                  <Input
                    id="grid-sl-pct"
                    inputMode="decimal"
                    value={slUnderPct}
                    disabled={busy}
                    aria-invalid={parsed(slUnderPct) === null}
                    onChange={(event) =>
                      touched(setSlUnderPct)(event.target.value)
                    }
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
                  onOn={touched(setBaseOn)}
                  onUnderPct={touched(setBaseUnderPct)}
                  onReclaimDays={touched(setBaseReclaimDays)}
                />
              </>
            ) : null}
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
                htmlFor="grid-spacing"
                hint={GRID_SPACING_HINTS[spacing]}
              >
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
                aria-invalid={parsed(maxOrderVolPct) === null}
                onChange={(event) =>
                  touched(setMaxOrderVolPct)(event.target.value)
                }
                className="bg-background"
              />
            </div>
          </OptionCard>
        </div>
      </ScrollArea>

      {/* Below the scroll, not in it: however many levels the grid has, the
            refusal and the button that would ignore it stay on screen. */}
      <div className="border-t p-3">
        <OrderRefusal id="grid-refusal" className="pb-3">
          {refusal}
        </OrderRefusal>
        <Button
          type="button"
          onClick={() => void submit()}
          aria-describedby={refusal ? "grid-refusal" : undefined}
          disabled={!ready}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {`Place${plan ? ` ${plan.levels.length}` : ""} buy${
            plan && plan.levels.length === 1 ? "" : "s"
          }`}
        </Button>
      </div>
    </FloatingOrderWindow>
  )
}
