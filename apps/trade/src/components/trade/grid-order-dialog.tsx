import * as React from "react"
import { GripVerticalIcon, Loader2Icon } from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { OptionCard } from "@/components/trade/option-card"
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
import { loadSmartGridParams } from "@/lib/api/smart-orders"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
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
  gridStopUnder,
  GRID_SPACING_HINTS,
  GRID_SPACING_LABELS,
  GRID_SPACINGS,
  GRID_STEP_FEE_MULTIPLE,
  MAX_GRID_LEVELS,
  MIN_GRID_LEVELS,
  type GridParams,
  type GridSpacing,
} from "@/lib/trade/grid"

/**
 * The grid window the Smart order menu opens, floating at the level clicked.
 *
 * The clicked price becomes the TOP of the range, which is the same promise the
 * ladder makes: what you pointed at is where the plan hangs from. Everything
 * else is the grid's shape — how far down, how many levels, how much of the
 * account — and the stop that ends it if the range fails.
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
const EDGE = 8

/** A number field as typed, and what it parses to. */
function parsed(value: string): number | null {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) ? n : null
}

export function GridOrderDialog({
  state,
  market,
  wallet,
  real,
  equity,
  free,
  takerFeeRate,
  busy,
  onPreview,
  onPlace,
  onClose,
}: {
  state: GridOrderState
  market: MarketRow
  /** The wallet this grid will live in. */
  wallet: string
  /** Live wallet: require a second, explicit confirmation. */
  real: boolean
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

  const [loaded, setLoaded] = React.useState(false)
  const [levels, setLevels] = React.useState(
    String(defaultGridParams().levels)
  )
  const [potPct, setPotPct] = React.useState(String(defaultGridParams().potPct))
  const [maxOrderVolPct, setMaxOrderVolPct] = React.useState("0")
  const [spacing, setSpacing] = React.useState<GridSpacing>("even")
  // The range STRADDLES the price: levels above it are sells of what the grid
  // holds, levels below are buys waiting for a dip, and the grid earns from
  // price crossing back and forth between them.
  //
  // Set as two PERCENTAGES of the price, not two prices. A percentage means the
  // same thing on the next coin you open — "8% either side" is a grid you can
  // picture — while a price is only meaningful on the coin it came from, and
  // was remembered onto charts where it was nonsense.
  const [abovePct, setAbovePct] = React.useState(
    String(DEFAULT_GRID_ABOVE_PCT)
  )
  const [belowPct, setBelowPct] = React.useState(String(DEFAULT_GRID_BELOW_PCT))
  const [tpOn, setTpOn] = React.useState(true)
  const [tpPct, setTpPct] = React.useState(
    String(defaultGridParams().takeProfitPct ?? DEFAULT_GRID_TAKE_PROFIT_PCT)
  )
  const [slOn, setSlOn] = React.useState(true)
  const [slUnderPct, setSlUnderPct] = React.useState(
    String(defaultGridParams().stopLoss?.underPct ?? 5)
  )
  const [baseOn, setBaseOn] = React.useState(false)
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(DEFAULT_BASE_STOP_RECLAIM_DAYS)
  )
  const [confirmedPlan, setConfirmedPlan] = React.useState<string | null>(null)

  React.useEffect(() => {
    let stale = false
    loadSmartGridParams()
      .then(({ params }) => {
        if (stale || !params) return
        setLevels(String(params.levels))
        setPotPct(String(params.potPct))
        setMaxOrderVolPct(String(params.maxOrderVolPct))
        setSpacing(params.spacing)
        setAbovePct(String(params.abovePct))
        setBelowPct(String(params.rangePct))
        setTpOn(params.takeProfitPct !== null)
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
      // A failed load just means defaults — the window still works.
      .catch(() => undefined)
      .finally(() => {
        if (!stale) setLoaded(true)
      })
    return () => {
      stale = true
    }
    // Deliberately once: re-running it would overwrite what is being typed.
  }, [])

  // ----- Where the window sits, and moving it ----------------------------

  const [at, setAt] = React.useState(() => ({
    x: Math.max(EDGE, Math.min(state.x, window.innerWidth - PANEL_WIDTH - EDGE)),
    y: Math.max(EDGE, Math.min(state.y, window.innerHeight - PANEL_HEIGHT)),
  }))
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null)

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const grab = dragRef.current
      if (!grab) return
      setAt({
        x: Math.max(
          EDGE,
          Math.min(event.clientX - grab.dx, window.innerWidth - PANEL_WIDTH - EDGE)
        ),
        y: Math.max(
          EDGE,
          Math.min(
            event.clientY - grab.dy,
            window.innerHeight - MIN_PANEL_HEIGHT - EDGE
          )
        ),
      })
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // ----- The honest arithmetic, live -------------------------------------

  // The two ends as prices, off today's price. Worked out here and nowhere
  // else, so what the summary counts, what the chart previews and what the
  // server is sent are the same three numbers.
  const above = parsed(abovePct)
  const below = parsed(belowPct)
  const top =
    above === null || !(market.price > 0) ? null : market.price * (1 + above / 100)
  const bottom =
    below === null || !(market.price > 0) ? null : market.price * (1 - below / 100)

  const params = React.useMemo((): GridParams | null => {
    const candidate: GridParams = {
      levels: parsed(levels) ?? -1,
      potPct: parsed(potPct) ?? -1,
      // A grid placed by hand is sized once, off the account right now.
      compound: true,
      maxOrderVolPct: parsed(maxOrderVolPct) ?? -1,
      spacing,
      // Remembered as depths, so the next grid on another coin opens at the
      // same shape rather than at this coin's prices.
      abovePct: above ?? -1,
      rangePct: below ?? -1,
      baseDetection: baseStopDetection(),
      takeProfitPct: tpOn ? (parsed(tpPct) ?? -1) : null,
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

  // How many levels are above the price, and what buying into them costs.
  const startNow =
    plan?.levels.filter((one) => one.buyPx >= market.price).length ?? 0
  const startCost =
    plan?.levels
      .filter((one) => one.buyPx >= market.price)
      .reduce((sum, one) => sum + one.sz * market.price, 0) ?? 0

  const takeProfitPx =
    tpOn && top !== null && top > 0 ? top * (1 + (parsed(tpPct) ?? 0) / 100) : null

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
    if (takeProfitPx !== null) lines.push({ px: takeProfitPx, kind: "takeProfit" })
    if (stopPx !== null) lines.push({ px: stopPx, kind: "stopLoss" })
    onPreview(lines)
  }, [plan, onPreview, top, bottom, takeProfitPx, stopPx])

  // Every refusal the server would give, said here first so nobody presses
  // Place to find out. Same order and same wording as the server's.
  const refusal =
    top === null || bottom === null || !(top > 0) || !(bottom > 0)
      ? "Both ends of the range need to be a percentage above zero."
      : bottom >= top
        ? "The bottom of the grid has to be below the top."
        : !params
            ? `Something here does not make sense yet — between ${MIN_GRID_LEVELS} and ${MAX_GRID_LEVELS} levels, and a share above zero.`
            : plan && plan.stepPct <= takerFeeRate * GRID_STEP_FEE_MULTIPLE
              ? "Those levels sit too close together to clear the trading fee — each round trip would lose money. Use a wider range or fewer levels."
              : plan && plan.tooSmallIndex !== null
                ? `Level ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer levels or a bigger share.`
                : plan && plan.totalCost > free
                  ? `The grid costs ${formatUsd(plan.totalCost)} but only ${formatUsd(free)} is free — nothing would fit.`
                  : null

  const ready = loaded && !busy && refusal === null && plan !== null
  const planKey =
    params && top !== null && bottom !== null
      ? JSON.stringify({ wallet, market: market.key, top, bottom, params })
      : null
  const previousPlanKey = React.useRef(planKey)
  React.useEffect(() => {
    if (previousPlanKey.current === planKey) return
    previousPlanKey.current = planKey
    setConfirmedPlan(null)
  }, [planKey])
  const confirming = real && planKey !== null && confirmedPlan === planKey

  const submit = async () => {
    if (!ready || !params || top === null || bottom === null) return
    if (real && !confirming) {
      setConfirmedPlan(planKey)
      return
    }
    const placed = await onPlace({ topPx: top, bottomPx: bottom, params })
    if (placed) onClose()
  }

  const testnet = parseMarketKey(market.key)?.network === "testnet"
  const perLevel = plan && plan.levels.length > 0 ? plan.levels[0].dollars : null
  const stepUsd =
    plan && plan.levels.length > 0
      ? plan.levels[0].sellPx - plan.levels[0].buyPx
      : null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        role="dialog"
        aria-label={`Grid on ${market.symbol}`}
        // Three rows — bar, fields, button — with the middle one taking
        // whatever is left, so the fields scroll rather than the window growing
        // past the screen. Same shape as the ladder's window, deliberately.
        className="fixed z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border bg-card shadow-lg"
        style={{
          left: at.x,
          top: at.y,
          width: PANEL_WIDTH,
          maxHeight: Math.max(
            MIN_PANEL_HEIGHT,
            Math.min(PANEL_HEIGHT, window.innerHeight - at.y - EDGE)
          ),
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            dragRef.current = {
              dx: event.clientX - at.x,
              dy: event.clientY - at.y,
            }
          }}
        >
          <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Grid
          </span>
          <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate font-medium text-foreground">
              {wallet}
            </span>
            <span className="shrink-0 tabular-nums">· {formatUsd(free)} free</span>
          </span>
        </div>

        <ScrollArea
          className="h-full"
          viewportClassName="[&>div]:block!"
        >
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
              hint="How far above and below today's price the grid works. Buys are spread evenly across that range, and each one sells a step above itself."
            >
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="grid-top" className="text-xs">
                    Above %
                  </Label>
                  <Input
                    id="grid-top"
                    inputMode="decimal"
                    value={abovePct}
                    disabled={!loaded}
                    aria-invalid={above === null}
                    onChange={(event) => setAbovePct(event.target.value)}
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
                    disabled={!loaded}
                    aria-invalid={below === null}
                    onChange={(event) => setBelowPct(event.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
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
                  disabled={!loaded}
                  aria-invalid={parsed(levels) === null}
                  onChange={(event) => setLevels(event.target.value)}
                  className="bg-background"
                />
              </div>
              {/* What the straddle means in plain numbers: how much it buys
                  the moment you press Place, and how much waits below. */}
              {startNow > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {startNow} level{startNow === 1 ? "" : "s"} sit above the
                  price, so it buys {formatUsd(startCost)} at market now to sell
                  into them. The rest waits below.
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
                <div className="flex items-baseline justify-between gap-2">
                  <span>Each buy spends</span>
                  <span className="tabular-nums">
                    {perLevel === null ? "—" : formatUsd(perLevel)}
                  </span>
                </div>
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
              hint="The share of the account the whole grid may spend, split evenly across the levels. Every level always spends the same amount, cycle after cycle."
            >
              <div className="grid gap-2">
                <Label htmlFor="grid-pot" className="text-xs">
                  Share of account %
                </Label>
                <Input
                  id="grid-pot"
                  inputMode="decimal"
                  value={potPct}
                  disabled={!loaded}
                  aria-invalid={parsed(potPct) === null}
                  onChange={(event) => setPotPct(event.target.value)}
                  className="bg-background"
                />
              </div>
            </OptionCard>

            <OptionCard
              id="grid-tp-on"
              title="Take profit"
              hint="A price above the range. Reaching it sells everything and finishes the grid for good. Without it the grid never ends on the upside — it just waits above its range for price to come back down."
              toggle={{ checked: tpOn, disabled: !loaded, onChange: setTpOn }}
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
                      disabled={!loaded}
                      aria-invalid={parsed(tpPct) === null}
                      onChange={(event) => setTpPct(event.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>Sells everything at</span>
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
              hint="A stop below the bottom of the range. If price cuts through it, everything held is sold and the grid is over. It hangs off the range, not off your average buy price — an average that moves as the grid recycles would drag the stop up into the range."
              toggle={{
                checked: slOn,
                disabled: !loaded,
                onChange: setSlOn,
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
                      disabled={!loaded}
                      aria-invalid={parsed(slUnderPct) === null}
                      onChange={(event) => setSlUnderPct(event.target.value)}
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
                    disabled={!loaded}
                    onOn={setBaseOn}
                    onUnderPct={setBaseUnderPct}
                    onReclaimDays={setBaseReclaimDays}
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
                    The liquidity guard is shrinking some buys — the amounts
                    above show it.
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
                  onValueChange={(next) => setSpacing(next as GridSpacing)}
                >
                  <SelectTrigger id="grid-spacing" className="w-full bg-background">
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
                  disabled={!loaded}
                  aria-invalid={parsed(maxOrderVolPct) === null}
                  onChange={(event) => setMaxOrderVolPct(event.target.value)}
                  className="bg-background"
                />
              </div>
            </OptionCard>
          </div>
        </ScrollArea>

        {/* Below the scroll, not in it: however many levels the grid has, the
            refusal and the button that would ignore it stay on screen. */}
        <div className="border-t p-3">
          {refusal ? (
            <p className="pb-3 text-xs text-red-600 dark:text-red-400">
              {refusal}
            </p>
          ) : null}
          {real && confirming && plan ? (
            <p className="mb-3 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
              {testnet
                ? `Testnet grid in ${wallet} — pretend money`
                : `Real-money grid in ${wallet}`}
              : place {plan.levels.length} buys using up to{" "}
              {formatUsd(plan.totalCost)}.
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            {busy || !loaded ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {real && confirming
              ? testnet
                ? "Confirm testnet grid"
                : "Confirm real-money grid"
              : `Place${plan ? ` ${plan.levels.length}` : ""} buy${
                  plan && plan.levels.length === 1 ? "" : "s"
                }`}
          </Button>
        </div>
      </div>
    </>
  )
}
