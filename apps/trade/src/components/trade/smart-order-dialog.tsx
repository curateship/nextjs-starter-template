import * as React from "react"
import {
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { OptionCard } from "@/components/trade/option-card"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { TouchOrderFrame } from "@/components/trade/touch-order-frame"
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
import { loadLadderBase, loadSmartDcaParams } from "@/lib/api/smart-orders"
import { type CandleInterval, type MarketRow } from "@/lib/protocols/contracts"
import {
  DCA_ANCHOR_HINTS,
  CASH_ONLY,
  DCA_ANCHOR_LABELS,
  DCA_ANCHORS,
  DCA_TP_MODE_HINTS,
  DCA_TP_MODE_LABELS,
  DCA_TP_MODES,
  dcaLadderPlan,
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
  DEFAULT_DCA_STOP_LOSS_PCT,
  dcaParamsSchema,
  defaultDcaParams,
  type DcaAnchor,
  type DcaParams,
  type DcaTpMode,
  baseStopDetection,
} from "@/lib/trade/dca"
import { formatPrice, formatUsd } from "@/lib/trade/format"

/**
 * The DCA window the Smart order menu opens, floating at the level clicked.
 *
 * The clicked price is where the ladder hangs from; everything here is the
 * ladder's shape — the steps between buys, the size ramp, how much of the
 * account the whole thing may spend — and the exits, decided up front. The
 * live summary underneath does the honest arithmetic the whole time, and a
 * ladder that cannot be placed says exactly why, before Place is pressed.
 *
 * Percentages die here. What is placed is concrete prices and sizes, and the
 * numbers shown come from the same `dcaLadderPlan` the server derives them
 * from — what is shown is what is placed.
 */

export type SmartOrderState = { px: number; x: number; y: number }

const PANEL_WIDTH = 304
/**
 * What the window takes at its tallest. Past this the fields scroll inside it
 * rather than the window growing — a ladder with a dozen rungs would otherwise
 * run off the bottom of the screen.
 */
const PANEL_HEIGHT = 560
/** Below this there is not enough left to be worth drawing fields into. */
const MIN_PANEL_HEIGHT = 260
const EDGE = 8

/** A number field as typed, and what it parses to. */
function parsed(value: string): number | null {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) ? n : null
}

/**
 * One rung of the ladder while it is being typed: what is in its box, and a
 * name of its own that outlives its position in the list.
 *
 * **The name is why it exists.** React tells two rows apart by their key, and
 * keying these by position meant removing the third rung handed the fourth
 * rung's box to the third rung's row — same DOM box, new number, and whatever
 * was half-typed, selected or undone in it belonged to a different rung. The
 * name is minted once when the rung appears and never changes, so a removal
 * takes exactly one row away and leaves every other box where it was.
 */
type Rung = { id: string; value: string }

/** Counts up for the life of the tab; nothing is stored or compared to it. */
let nextRungId = 0

function rungsFrom(deviations: readonly number[]): Rung[] {
  return deviations.map((deviation) => ({
    id: `rung-${(nextRungId += 1)}`,
    value: String(deviation),
  }))
}

export function SmartOrderDialog({
  state,
  wide = true,
  market,
  wallet,
  equity,
  free,
  interval,
  busy,
  onPreview,
  onPlace,
  onClose,
}: {
  state: SmartOrderState
  wide?: boolean
  market: MarketRow
  /** The wallet this ladder will live in. */
  wallet: string
  /** What the account is worth — the pot the shares are cut from. */
  equity: number
  /** Cash not already behind something — what the ladder must fit inside. */
  free: number
  /** The chart's timeframe — what two-green mode would watch. */
  interval: CandleInterval
  busy: boolean
  /** The rung prices as edited, live — the chart draws them as faint lines. */
  onPreview: (levels: number[] | null) => void
  onPlace: (input: {
    clickPx: number
    interval: CandleInterval
    params: DcaParams
  }) => Promise<boolean>
  onClose: () => void
}) {
  // ----- The settings, remembered server-side ----------------------------

  // Defaults are drawn at once; the remembered settings replace them when
  // they land. Until then the fields are disabled rather than half-true.
  const [loaded, setLoaded] = React.useState(false)
  const [rungs, setRungs] = React.useState<Rung[]>(() =>
    rungsFrom(defaultDcaParams().rungs.map((rung) => rung.deviation))
  )
  const [maxPositionPct, setMaxPositionPct] = React.useState(
    String(defaultDcaParams().maxPositionPct)
  )
  const [sizeMultiplier, setSizeMultiplier] = React.useState(
    String(defaultDcaParams().sizeMultiplier)
  )
  const [maxOrderVolPct, setMaxOrderVolPct] = React.useState("0")
  const [twoGreen, setTwoGreen] = React.useState(false)
  const [anchor, setAnchor] = React.useState<DcaAnchor>("base")
  const [tpOn, setTpOn] = React.useState(true)
  const [tpMode, setTpMode] = React.useState<DcaTpMode>("average")
  const [tpPct, setTpPct] = React.useState("2")
  const [slOn, setSlOn] = React.useState(false)
  const [slPct, setSlPct] = React.useState("1")
  const [baseOn, setBaseOn] = React.useState(false)
  const [baseUnderPct, setBaseUnderPct] = React.useState(
    String(DEFAULT_BASE_STOP_UNDER_PCT)
  )
  const [baseReclaimDays, setBaseReclaimDays] = React.useState(
    String(DEFAULT_BASE_STOP_RECLAIM_DAYS)
  )
  // The level the ladder hangs from — the confirmed base, not the click. Read
  // before anything is drawn, because every rung is stepped down from it and a
  // preview measured from somewhere else would not be what gets placed.
  const [basePx, setBasePx] = React.useState<number | null>(null)
  const [baseRead, setBaseRead] = React.useState(false)

  React.useEffect(() => {
    let stale = false
    loadLadderBase(market.key)
      .catch(() => ({ basePx: null }))
      .then(({ basePx: found }) => {
        if (stale) return
        setBasePx(found)
        setBaseRead(true)
      })
    return () => {
      stale = true
    }
  }, [market.key])

  React.useEffect(() => {
    let stale = false
    loadSmartDcaParams()
      .then(({ params }) => {
        if (stale || !params) return
        setRungs(rungsFrom(params.rungs.map((rung) => rung.deviation)))
        setMaxPositionPct(String(params.maxPositionPct))
        setSizeMultiplier(String(params.sizeMultiplier))
        setMaxOrderVolPct(String(params.maxOrderVolPct))
        setTwoGreen(params.twoGreen)
        setAnchor(params.anchor)
        setTpOn(params.takeProfit !== null)
        if (params.takeProfit) {
          setTpMode(params.takeProfit.mode)
          setTpPct(String(params.takeProfit.pct))
        }
        setSlOn(params.stopLoss !== null)
        if (params.stopLoss) {
          setSlPct(String(params.stopLoss.pct))
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
        // Never dragged so low that the Place button falls off the bottom:
        // the window shrinks as it goes down, and this is where it stops
        // shrinking.
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

  const params = React.useMemo((): DcaParams | null => {
    const deviations = rungs.map((rung) => parsed(rung.value))
    if (deviations.some((one) => one === null)) return null
    const candidate: DcaParams = {
      rungs: deviations.map((deviation) => ({ deviation: deviation as number })),
      // A ladder placed by hand from the chart. The crash rule needs to watch
      // a whole list of coins at once, which only a flow has, so there is
      // nothing sensible to offer here. Same for the entry limit: it counts
      // coins across a wallet, and one hand-placed ladder is one coin.
      cascade: null,
      entryLimit: null,
      // The one place still on the indicator's factory numbers, and the one
      // place that arguably should not be: you are clicking a base the chart
      // drew, so this ought to follow whatever the chart was drawing it with.
      // The page has those settings; they are not threaded down here yet.
      baseDetection: baseStopDetection(),
      maxPositionPct: parsed(maxPositionPct) ?? -1,
      sizeMultiplier: parsed(sizeMultiplier) ?? -1,
      // Hand-placed ladders have no repeat cycle. Keep their existing sizing.
      compound: true,
      // Cash. A ladder placed by hand goes to a real or practice wallet, and
      // both placement paths force this anyway — a box here would be a setting
      // that does nothing.
      leverage: CASH_ONLY,
      maxOrderVolPct: parsed(maxOrderVolPct) ?? -1,
      twoGreen,
      anchor,
      // Inert: the placement path forces every ladder onto watched triggers,
      // whatever is sent here. Carried only because the params type still
      // has the field.
      rungEntry: "limit",
      takeProfit: tpOn ? { mode: tpMode, pct: parsed(tpPct) ?? -1 } : null,
      stopLoss: slOn
        ? {
            pct: parsed(slPct) ?? -1,
            base: baseOn
              ? {
                  underPct: parsed(baseUnderPct) ?? -1,
                  reclaimDays: parsed(baseReclaimDays) ?? -1,
                }
              : null,
          }
        : null,
    }
    const checked = dcaParamsSchema.safeParse(candidate)
    return checked.success ? checked.data : null
  }, [
    rungs,
    maxPositionPct,
    sizeMultiplier,
    maxOrderVolPct,
    twoGreen,
    anchor,
    tpOn,
    tpMode,
    tpPct,
    slOn,
    slPct,
    baseOn,
    baseUnderPct,
    baseReclaimDays,
  ])

  const hangsFrom = anchor === "click" ? state.px : basePx

  const plan = React.useMemo(
    () =>
      params && hangsFrom !== null
        ? dcaLadderPlan({
            anchorPx: hangsFrom,
            equity,
            params,
            sizeDecimals: market.sizeDecimals,
            volume24hUsd: market.volume24hUsd,
          })
        : null,
    [params, hangsFrom, equity, market.sizeDecimals, market.volume24hUsd]
  )

  React.useEffect(() => {
    onPreview(plan ? plan.rungs.map((rung) => rung.px) : null)
  }, [plan, onPreview])
  // The preview dies with the window, whichever way it closes.
  React.useEffect(() => () => onPreview(null), [onPreview])

  // The stop the window suggests sits below the DEEPEST rung even if only the
  // first has bought — so switching it on never quietly disarms the ladder.
  const suggestedSlPct =
    plan && plan.rungs.length > 0
      ? Math.min(
          98,
          Math.ceil(
            (1 - plan.rungs[plan.rungs.length - 1].px / plan.rungs[0].px) * 100
          ) + 2
        )
      : DEFAULT_DCA_STOP_LOSS_PCT

  const noBase = anchor === "base" && baseRead && basePx === null
  const underBase =
    anchor === "base" && basePx !== null && market.price < basePx

  const refusal = noBase
    ? "This market has no confirmed base yet, and the ladder hangs from one. Point it at the clicked price in Advanced settings, or wait for the chart to mark a base."
    : underBase
      ? `Price is already under the base at ${formatPrice(basePx as number)}, so that level has gone. The ladder starts when price is at or above a base and buys the fall from there.`
      : !params
        ? "A number here does not make sense yet — every step needs to be between 0 and 99."
        : plan && plan.tooSmallIndex !== null
          ? `Rung ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer rungs, a gentler ramp, or a bigger share.`
          : plan && plan.totalCost > free
            ? `The ladder costs ${formatUsd(plan.totalCost)} but only ${formatUsd(free)} is free — nothing would fit.`
            : null

  const ready =
    loaded &&
    (anchor === "click" || baseRead) &&
    !busy &&
    refusal === null &&
    plan !== null
  const submit = async () => {
    if (!ready || !params) return
    const placed = await onPlace({ clickPx: state.px, interval, params })
    if (placed) onClose()
  }

  const setRung = (id: string, value: string) =>
    setRungs((held) =>
      held.map((one) => (one.id === id ? { ...one, value } : one))
    )
  const removeRung = (id: string) =>
    setRungs((held) => held.filter((one) => one.id !== id))
  // Each added rung steps 3 deeper than the last, the old app's pattern —
  // 5, 8, 11 — so an added ladder widens instead of bunching up.
  const addRung = () =>
    setRungs((held) => {
      const last = Number(held[held.length - 1]?.value)
      const next =
        Number.isFinite(last) && last > 0 ? Math.min(99, last + 3) : 5
      return [...held, ...rungsFrom([next])]
    })

  return (
    <TouchOrderFrame
      label={`DCA ladder on ${market.symbol} from its base`}
      wide={wide}
      // Three rows — bar, fields, button — and the middle one takes whatever
      // is left. A grid rather than a stack of flexing boxes because a grid
      // row is a real height: the scroller inside can fill it. A flexing box
      // in a window with a largest size but no set size is not, and anything
      // told to fill one quietly grows to fit its contents instead, which is
      // the one thing that never scrolls.
      desktopClassName="fixed z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border bg-card shadow-lg"
      sheetClassName="grid h-[min(680px,calc(100dvh-8px))] grid-rows-[auto_minmax(0,1fr)_auto]"
      desktopStyle={{
        left: at.x,
        top: at.y,
        width: PANEL_WIDTH,
        // However far down the window sits, it ends above the screen's edge,
        // and it never grows past its own height however many rungs are in it.
        maxHeight: Math.max(
          MIN_PANEL_HEIGHT,
          Math.min(PANEL_HEIGHT, window.innerHeight - at.y - EDGE)
        ),
      }}
      onClose={onClose}
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
            DCA ladder
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
        >
          <div className="grid gap-4 p-3">
            {/* What the whole ladder hangs from. Said out loud rather than
                implied: every rung below is a step down from this number, and
                a ladder measured from somewhere you cannot see is a ladder you
                cannot check. */}
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {anchor === "click" ? "Hangs from your click" : "Hangs from the base"}
              </span>
              <span className="font-medium tabular-nums">
                {hangsFrom === null
                  ? baseRead
                    ? "none yet"
                    : "…"
                  : formatPrice(hangsFrom)}
              </span>
            </div>
            <OptionCard
              id="smart-ladder"
              title="Ladder"
              hint="Each step is measured below the buy above it, so the drops compound. The first is below the price you clicked."
            >
              {rungs.map((rung, index) => {
                const planned = plan?.rungs[index]
                return (
                  <div key={rung.id} className="flex items-center gap-2">
                    <span className="w-4 text-right text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <Input
                      id={`smart-rung-${index + 1}`}
                      inputMode="decimal"
                      value={rung.value}
                      disabled={busy || !loaded}
                      aria-label={`Rung ${index + 1}, percent below the buy above`}
                      aria-invalid={parsed(rung.value) === null}
                      onChange={(event) => setRung(rung.id, event.target.value)}
                      className="w-16 bg-background"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-muted-foreground">
                      {planned
                        ? `${formatPrice(planned.px)} · ${formatUsd(planned.dollars)}`
                        : "—"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      disabled={busy || !loaded || rungs.length <= 1}
                      aria-label={`Remove rung ${index + 1}`}
                      onClick={() => removeRung(rung.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={busy || !loaded || rungs.length >= 20}
                onClick={addRung}
              >
                <PlusIcon className="size-4" />
                Add rung
              </Button>
            </OptionCard>

            <OptionCard
              id="smart-position"
              title="Position"
              hint="How much of the account this ladder may put to work, and how that money is spread across the buys."
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="smart-pot"
                    hint="The most of the account the whole ladder can spend, split across the buys by the size ramp."
                  >
                    Max position %
                  </FieldLabel>
                  <Input
                    id="smart-pot"
                    inputMode="decimal"
                    value={maxPositionPct}
                    disabled={busy || !loaded}
                    aria-invalid={params === null && parsed(maxPositionPct) === null}
                    onChange={(event) => setMaxPositionPct(event.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="smart-ramp"
                    hint="How much bigger each buy is than the one above it. 1 = all equal; 2 = each buy doubles the last."
                  >
                    Size ramp ×
                  </FieldLabel>
                  <Input
                    id="smart-ramp"
                    inputMode="decimal"
                    value={sizeMultiplier}
                    disabled={busy || !loaded}
                    onChange={(event) => setSizeMultiplier(event.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            </OptionCard>

            <OptionCard
              id="smart-tp-on"
              title="Take profit"
              hint={DCA_TP_MODE_HINTS[tpMode]}
              toggle={{
                checked: tpOn,
                disabled: busy || !loaded,
                onChange: setTpOn,
              }}
            >
              {tpOn ? (
                <div className="flex items-end gap-2">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Label htmlFor="smart-tp-mode" className="text-xs">
                      Exit
                    </Label>
                    <Select
                      value={tpMode}
                      disabled={busy}
                      onValueChange={(next) => setTpMode(next as DcaTpMode)}
                    >
                      <SelectTrigger id="smart-tp-mode" className="w-full">
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
                  </div>
                  {tpMode === "average" ? (
                    <div className="grid w-16 shrink-0 gap-2">
                      <Label htmlFor="smart-tp-pct" className="text-xs">
                        Target %
                      </Label>
                      <Input
                        id="smart-tp-pct"
                        inputMode="decimal"
                        value={tpPct}
                        disabled={busy || !loaded}
                        aria-invalid={tpOn && parsed(tpPct) === null}
                        onChange={(event) => setTpPct(event.target.value)}
                        className="bg-background"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </OptionCard>

            <OptionCard
              id="smart-sl-on"
              title="Stop loss"
              hint="Percent below the average buy, following it as it moves. If the stop hits, everything sells and the waiting rungs are cancelled — unless the base rule below is on, which steps the ladder down to its next rung instead."
              toggle={{
                checked: slOn,
                disabled: busy || !loaded,
                onChange: (on) => {
                  setSlOn(on)
                  // Switched on, it starts below the deepest rung rather than
                  // wherever it was last — a stop above rungs disarms them.
                  if (on) setSlPct(String(suggestedSlPct))
                },
              }}
            >
              {slOn ? (
                <>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="smart-sl-pct"
                      hint="Where the stop rests until a base takes over. 100 means price would have to reach zero, which is how you say no stop before then."
                    >
                      Stop %
                    </FieldLabel>
                    <Input
                      id="smart-sl-pct"
                      inputMode="decimal"
                      value={slPct}
                      disabled={busy || !loaded}
                      aria-invalid={slOn && parsed(slPct) === null}
                      onChange={(event) => setSlPct(event.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <BaseStopFields
                    on={baseOn}
                    underPct={baseUnderPct}
                    reclaimDays={baseReclaimDays}
                    disabled={busy || !loaded}
                    onOn={setBaseOn}
                    onUnderPct={setBaseUnderPct}
                    onReclaimDays={setBaseReclaimDays}
                  />
                </>
              ) : null}
            </OptionCard>

            {/* The two settings a ladder rarely needs, out of the way of the
                ones it always does. Its own card, in a grey light enough to
                separate it from the fields above without reading as a
                different part of the app. Both settings are off unless
                somebody opens this and turns them on, so a shut card is never
                hiding something at work — except the liquidity guard, which
                says so on the face of the card whether it is open or not. */}
            <OptionCard
              id="smart-advanced"
              title="Advanced settings"
              defaultOpen={false}
              footer={
                // Outside the fold on purpose: the guard shrinking buys
                // explains amounts printed above it, and a note nobody can see
                // explains nothing.
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
                    htmlFor="smart-anchor"
                    hint={DCA_ANCHOR_HINTS[anchor]}
                  >
                    Rungs measured from
                  </FieldLabel>
                  <Select
                    value={anchor}
                    disabled={busy}
                    onValueChange={(next) => setAnchor(next as DcaAnchor)}
                  >
                    <SelectTrigger id="smart-anchor" className="w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DCA_ANCHORS.map((one) => (
                        <SelectItem key={one} value={one}>
                          {DCA_ANCHOR_LABELS[one]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="smart-vol-guard"
                    hint="Liquidity guard: no single buy bigger than this share of the coin's last-24-hours trading volume, so thin coins get small orders. 0 = off."
                  >
                    Max order, % of day's volume
                  </FieldLabel>
                  <Input
                    id="smart-vol-guard"
                    inputMode="decimal"
                    value={maxOrderVolPct}
                    disabled={busy || !loaded}
                    // The shared field is see-through, which on a grey card
                    // means a box you type into looks like one you cannot.
                    className="bg-background"
                    onChange={(event) => setMaxOrderVolPct(event.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="smart-two-green"
                    checked={twoGreen}
                    disabled={busy || !loaded}
                    onCheckedChange={(next) => setTwoGreen(next === true)}
                  />
                  <FieldLabel
                    htmlFor="smart-two-green"
                    hint={`Nothing rests on the book: the ladder watches the ${interval} candles and buys at market once two green closes confirm the turn — so fills can sit a little off the lines.`}
                  >
                    Only buy after 2 green {interval} candles
                  </FieldLabel>
                </div>
            </OptionCard>
          </div>
        </ScrollArea>

        {/* Below the scroll, not in it: however many rungs the ladder has, the
            refusal and the button that would ignore it stay on screen. */}
        <div className="border-t p-3">
          <OrderRefusal id="ladder-refusal" className="pb-3">
            {refusal}
          </OrderRefusal>
          <Button
            type="button"
            onClick={() => void submit()}
            aria-describedby={refusal ? "ladder-refusal" : undefined}
            disabled={!ready}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            {busy || !loaded ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {`Place${plan ? ` ${plan.rungs.length}` : ""} buy${
              plan && plan.rungs.length === 1 ? "" : "s"
            }`}
          </Button>
        </div>
    </TouchOrderFrame>
  )
}
