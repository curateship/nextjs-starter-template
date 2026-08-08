import * as React from "react"
import {
  ChevronDownIcon,
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { focusRingInset } from "@/lib/layout/focus-ring"
import { loadSmartDcaParams } from "@/lib/api/smart-orders"
import type { CandleInterval, MarketRow } from "@/lib/protocols/contracts"
import {
  DCA_TP_MODE_HINTS,
  DCA_TP_MODE_LABELS,
  DCA_TP_MODES,
  dcaLadderPlan,
  DEFAULT_DCA_STOP_LOSS_PCT,
  dcaParamsSchema,
  defaultDcaParams,
  type DcaParams,
  type DcaTpMode,
} from "@/lib/trade/dca"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

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

export function SmartOrderDialog({
  state,
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
    anchorPx: number
    interval: CandleInterval
    params: DcaParams
  }) => Promise<boolean>
  onClose: () => void
}) {
  // ----- The settings, remembered server-side ----------------------------

  // Defaults are drawn at once; the remembered settings replace them when
  // they land. Until then the fields are disabled rather than half-true.
  const [loaded, setLoaded] = React.useState(false)
  const [rungs, setRungs] = React.useState<string[]>(() =>
    defaultDcaParams().rungs.map((rung) => String(rung.deviation))
  )
  const [maxPositionPct, setMaxPositionPct] = React.useState(
    String(defaultDcaParams().maxPositionPct)
  )
  const [sizeMultiplier, setSizeMultiplier] = React.useState(
    String(defaultDcaParams().sizeMultiplier)
  )
  const [maxOrderVolPct, setMaxOrderVolPct] = React.useState("0")
  const [twoGreen, setTwoGreen] = React.useState(false)
  const [tpOn, setTpOn] = React.useState(true)
  const [tpMode, setTpMode] = React.useState<DcaTpMode>("average")
  const [tpPct, setTpPct] = React.useState("2")
  const [slOn, setSlOn] = React.useState(false)
  const [slPct, setSlPct] = React.useState("1")
  // The two settings almost nobody changes, folded away. Shut every time the
  // window opens: what is behind it is off by default, so an open card would
  // be height spent on two answers that are already "no".
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  React.useEffect(() => {
    let stale = false
    loadSmartDcaParams()
      .then(({ params }) => {
        if (stale || !params) return
        setRungs(params.rungs.map((rung) => String(rung.deviation)))
        setMaxPositionPct(String(params.maxPositionPct))
        setSizeMultiplier(String(params.sizeMultiplier))
        setMaxOrderVolPct(String(params.maxOrderVolPct))
        setTwoGreen(params.twoGreen)
        setTpOn(params.takeProfit !== null)
        if (params.takeProfit) {
          setTpMode(params.takeProfit.mode)
          setTpPct(String(params.takeProfit.pct))
        }
        setSlOn(params.stopLoss !== null)
        if (params.stopLoss) setSlPct(String(params.stopLoss.pct))
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
    const deviations = rungs.map(parsed)
    if (deviations.some((one) => one === null)) return null
    const candidate: DcaParams = {
      rungs: deviations.map((deviation) => ({ deviation: deviation as number })),
      maxPositionPct: parsed(maxPositionPct) ?? -1,
      sizeMultiplier: parsed(sizeMultiplier) ?? -1,
      maxOrderVolPct: parsed(maxOrderVolPct) ?? -1,
      twoGreen,
      takeProfit: tpOn ? { mode: tpMode, pct: parsed(tpPct) ?? -1 } : null,
      stopLoss: slOn ? { pct: parsed(slPct) ?? -1 } : null,
    }
    const checked = dcaParamsSchema.safeParse(candidate)
    return checked.success ? checked.data : null
  }, [
    rungs,
    maxPositionPct,
    sizeMultiplier,
    maxOrderVolPct,
    twoGreen,
    tpOn,
    tpMode,
    tpPct,
    slOn,
    slPct,
  ])

  const plan = React.useMemo(
    () =>
      params
        ? dcaLadderPlan({
            anchorPx: state.px,
            equity,
            params,
            sizeDecimals: market.sizeDecimals,
            volume24hUsd: market.volume24hUsd,
          })
        : null,
    [params, state.px, equity, market.sizeDecimals, market.volume24hUsd]
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

  const refusal = !params
    ? "A number here does not make sense yet — every step needs to be between 0 and 99."
    : plan && plan.tooSmallIndex !== null
      ? `Rung ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer rungs, a gentler ramp, or a bigger share.`
      : plan && plan.totalCost > free
        ? `The ladder costs ${formatUsd(plan.totalCost)} but only ${formatUsd(free)} is free — nothing would fit.`
        : null

  const ready = loaded && !busy && refusal === null && plan !== null

  const submit = async () => {
    if (!ready || !params) return
    const placed = await onPlace({ anchorPx: state.px, interval, params })
    if (placed) onClose()
  }

  const setRung = (index: number, value: string) =>
    setRungs((held) => held.map((one, i) => (i === index ? value : one)))
  const removeRung = (index: number) =>
    setRungs((held) => held.filter((_, i) => i !== index))
  // Each added rung steps 3 deeper than the last, the old app's pattern —
  // 5, 8, 11 — so an added ladder widens instead of bunching up.
  const addRung = () =>
    setRungs((held) => {
      const last = Number(held[held.length - 1])
      const next =
        Number.isFinite(last) && last > 0 ? Math.min(99, last + 3) : 5
      return [...held, String(next)]
    })

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
        aria-label={`DCA ladder on ${market.symbol} from ${formatPrice(state.px)}`}
        // Three rows — bar, fields, button — and the middle one takes whatever
        // is left. A grid rather than a stack of flexing boxes because a grid
        // row is a real height: the scroller inside can fill it. A flexing box
        // in a window with a largest size but no set size is not, and anything
        // told to fill one quietly grows to fit its contents instead, which is
        // the one thing that never scrolls.
        className="fixed z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-lg"
        style={{
          left: at.x,
          top: at.y,
          width: PANEL_WIDTH,
          // However far down the window sits, it ends above the screen's edge,
          // and it never grows past its own height however many rungs are in
          // it. Both are why the fields inside scroll.
          maxHeight: Math.max(
            MIN_PANEL_HEIGHT,
            Math.min(PANEL_HEIGHT, window.innerHeight - at.y - EDGE)
          ),
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b border-foreground/10 px-3 py-2 active:cursor-grabbing"
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
          // The viewport's inner box lays itself out as a table, which would
          // shrink the fields to their content instead of the window's width.
          viewportClassName="[&>div]:block!"
        >
          <div className="grid gap-4 p-3">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="smart-rung-1"
                hint="Each step is measured below the buy above it, so the drops compound. The first is below the price you clicked."
              >
                Steps down, % below the buy above
              </FieldLabel>
              {rungs.map((value, index) => {
                const planned = plan?.rungs[index]
                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-4 text-right text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <Input
                      id={`smart-rung-${index + 1}`}
                      inputMode="decimal"
                      value={value}
                      disabled={!loaded}
                      aria-label={`Rung ${index + 1}, percent below the buy above`}
                      aria-invalid={parsed(value) === null}
                      onChange={(event) => setRung(index, event.target.value)}
                      className="w-16"
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
                      disabled={!loaded || rungs.length <= 1}
                      aria-label={`Remove rung ${index + 1}`}
                      onClick={() => removeRung(index)}
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
                disabled={!loaded || rungs.length >= 20}
                onClick={addRung}
              >
                <PlusIcon className="size-4" />
                Add rung
              </Button>
            </div>

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
                  disabled={!loaded}
                  aria-invalid={params === null && parsed(maxPositionPct) === null}
                  onChange={(event) => setMaxPositionPct(event.target.value)}
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
                  disabled={!loaded}
                  onChange={(event) => setSizeMultiplier(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="smart-tp-on"
                  checked={tpOn}
                  disabled={!loaded}
                  onCheckedChange={(next) => setTpOn(next === true)}
                />
                <FieldLabel htmlFor="smart-tp-on" hint={DCA_TP_MODE_HINTS[tpMode]}>
                  Take profit
                </FieldLabel>
              </div>
              {tpOn ? (
                <div className="flex items-end gap-2">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Label htmlFor="smart-tp-mode" className="text-xs">
                      Exit
                    </Label>
                    <Select
                      value={tpMode}
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
                        disabled={!loaded}
                        aria-invalid={tpOn && parsed(tpPct) === null}
                        onChange={(event) => setTpPct(event.target.value)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="smart-sl-on"
                  checked={slOn}
                  disabled={!loaded}
                  onCheckedChange={(next) => {
                    const on = next === true
                    setSlOn(on)
                    // Switched on, it starts below the deepest rung rather than
                    // wherever it was last — a stop above rungs disarms them.
                    if (on) setSlPct(String(suggestedSlPct))
                  }}
                />
                <FieldLabel
                  htmlFor="smart-sl-on"
                  hint="Percent below the average buy, following it as it moves. If the stop hits, everything sells and the waiting rungs are cancelled — the ladder is over."
                >
                  Stop loss
                </FieldLabel>
              </div>
              {slOn ? (
                <Input
                  id="smart-sl-pct"
                  inputMode="decimal"
                  value={slPct}
                  disabled={!loaded}
                  aria-invalid={slOn && parsed(slPct) === null}
                  aria-label="Stop percent below the average buy"
                  onChange={(event) => setSlPct(event.target.value)}
                />
              ) : null}
            </div>

            {/* The two settings a ladder rarely needs, out of the way of the
                ones it always does. Its own card, in a grey light enough to
                separate it from the fields above without reading as a
                different part of the app. Both settings are off unless
                somebody opens this and turns them on, so a shut card is never
                hiding something at work — except the liquidity guard, which
                says so on the face of the card whether it is open or not. */}
            <Collapsible
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="grid gap-4 rounded-lg border border-foreground/5 bg-muted/30 p-3"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "group/trigger flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left text-sm leading-none font-medium select-none",
                    focusRingInset
                  )}
                >
                  Advanced settings
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/trigger:-rotate-90" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4">
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
                    disabled={!loaded}
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
                    disabled={!loaded}
                    onCheckedChange={(next) => setTwoGreen(next === true)}
                  />
                  <FieldLabel
                    htmlFor="smart-two-green"
                    hint={`Nothing rests on the book: the ladder watches the ${interval} candles and buys at market once two green closes confirm the turn — so fills can sit a little off the lines.`}
                  >
                    Only buy after 2 green {interval} candles
                  </FieldLabel>
                </div>
              </CollapsibleContent>
              {/* Outside the fold on purpose: the guard shrinking buys explains
                  amounts printed above it, and a note nobody can see explains
                  nothing. */}
              {plan?.volumeCapped ? (
                <p className="text-xs text-muted-foreground">
                  The liquidity guard is shrinking some buys — the amounts above
                  show it.
                </p>
              ) : null}
            </Collapsible>
          </div>
        </ScrollArea>

        {/* Below the scroll, not in it: however many rungs the ladder has, the
            refusal and the button that would ignore it stay on screen. */}
        <div className="border-t border-foreground/10 p-3">
          {refusal ? (
            <p className="pb-3 text-xs text-red-600 dark:text-red-400">
              {refusal}
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
            Place{plan ? ` ${plan.rungs.length}` : ""} buy
            {plan && plan.rungs.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </>
  )
}
