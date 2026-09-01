import * as React from "react"
import { Loader2Icon } from "lucide-react"

import {
  dcaSettingsFormState,
  inspectDcaSettingsForm,
} from "@/components/trade/dca-settings-form"
import { DcaSettingsFields } from "@/components/trade/dca-settings-fields"
import { FloatingOrderWindow } from "@/components/trade/floating-order-window"
import {
  MIN_ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_HEIGHT,
  ORDER_WINDOW_WIDTH,
  parseOrderNumber as parsed,
  useOrderWindowForm,
} from "@/components/trade/order-window-form"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ladderBase } from "@/lib/trade/ladder-base-cache"
import {
  freshDcaPrefs,
  knownDcaPrefs,
  rememberDcaPrefs,
} from "@/lib/trade/smart-prefs-cache"
import { type CandleInterval, type MarketRow } from "@/lib/protocols/contracts"
import {
  DEFAULT_DCA_EXIT_GAP_PCT,
  baseStopDetection,
  dcaLadderPlan,
  dcaLadderSettingsSchema,
  exitLadderGapPctForPrice,
  resizedDcaDeviations,
  DEFAULT_DCA_STOP_LOSS_PCT,
  dcaParamsSchema,
  defaultDcaParams,
  type DcaParams,
} from "@/lib/trade/dca"
import { formatPrice } from "@/lib/trade/format"
import { marketLeverageLimit } from "@/lib/trade/leverage"
import { BUY_BUTTON } from "@/lib/trade/money-tone"
import { showErrorToast } from "@/lib/toast/error-toast"
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

/** The DCA shape drawn on the chart while the placement window is open. */
export type DcaPreview = {
  anchorPx: number
  rungs: readonly { px: number; dollars: number }[]
  /** Null unless the mirrored exit mode is on. */
  exitGapPct?: number | null
  /** Move the complete shape without changing the gaps between its rungs. */
  onMove: (anchorPx: number) => void | Promise<boolean>
  /** Move the deepest rung and spread every gap by the same proportion. */
  onResize: (deepestPx: number) => void | Promise<boolean>
  /** Move every mirrored exit while preserving the gaps between them. */
  onMoveExit?: (exitIndex: number, exitPx: number) => void | Promise<boolean>
}

export function SmartOrderDialog({
  state,
  wide = true,
  market,
  equity,
  free,
  interval,
  busy,
  pairedWithGrid = false,
  onPreview,
  onPlace,
  onClose,
}: {
  state: SmartOrderState
  wide?: boolean
  market: MarketRow
  /** What the account is worth — the pot the shares are cut from. */
  equity: number
  /** Cash not already behind something — what the ladder must fit inside. */
  free: number
  /** The chart's timeframe — what two-green mode would watch. */
  interval: CandleInterval
  busy: boolean
  /**
   * A grid is already working this coin, so placing the ladder pairs the
   * two. The window then says out loud what they will share.
   */
  pairedWithGrid?: boolean
  /** The editable ladder shape the chart draws before Place is pressed. */
  onPreview: (preview: DcaPreview | null) => void
  onPlace: (input: {
    clickPx: number
    interval: CandleInterval
    params: DcaParams
  }) => Promise<boolean>
  onClose: () => void
}) {
  // ----- The settings, remembered server-side ----------------------------

  // The window opens ON the last-known settings — the copy the browser kept
  // from the last read or placement — and falls back to the defaults only
  // before either has ever happened. A fresh read still runs behind it, but
  // it almost always answers with the same values the fields were seeded
  // with, so nothing on screen moves. Opening on defaults and swapping when
  // the read landed made the fields visibly snap a second in.
  const [seeded] = React.useState(knownDcaPrefs)
  const {
    edited: editedRef,
    touched,
    showValidation,
    setShowValidation,
  } = useOrderWindowForm()
  const [form, setForm] = React.useState(() =>
    dcaSettingsFormState(
      dcaLadderSettingsSchema.parse(seeded ?? defaultDcaParams())
    )
  )
  const changeForm = React.useCallback(
    (next: typeof form) => touched(setForm)(next),
    [touched]
  )
  // A chart drag turns the preview into a click-anchored ladder at the dropped
  // price. Kept apart from `state.px`, which is the original right-click and
  // still owns where the floating window opened.
  const [movedClickPx, setMovedClickPx] = React.useState<number | null>(null)
  // The level the ladder hangs from — the confirmed base. Asked for in the
  // background (and usually prefetched as the menu opened); until it lands the
  // preview hangs from the click so something honest is on screen at once, and
  // it re-anchors the moment the base arrives. Placing still waits for this
  // read, because what is shown has to be what is placed.
  const [basePx, setBasePx] = React.useState<number | null>(null)
  const [baseRead, setBaseRead] = React.useState(false)

  React.useEffect(() => {
    let stale = false
    ladderBase(market.key)
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
    void freshDcaPrefs().then((params) => {
      // A field already typed into is never overwritten — the remembered
      // settings lost the race and the hand wins. Values equal to what the
      // fields were seeded with change nothing on screen.
      if (stale || !params || editedRef.current) return
      setForm(dcaSettingsFormState(dcaLadderSettingsSchema.parse(params)))
    })
    return () => {
      stale = true
    }
  }, [editedRef])

  // ----- The honest arithmetic, live -------------------------------------

  const maxBorrowing = marketLeverageLimit(market.maxLeverage)
  const inspection = React.useMemo(
    () => inspectDcaSettingsForm(form, maxBorrowing, true),
    [form, maxBorrowing]
  )
  const params = React.useMemo((): DcaParams | null => {
    if (!inspection.settings) return null
    const checked = dcaParamsSchema.safeParse({
      ...inspection.settings,
      cascade: null,
      entryLimit: null,
      baseDetection: baseStopDetection(),
      compound: true,
      rungEntry: "limit",
    })
    return checked.success ? checked.data : null
  }, [inspection.settings])

  // The click stands in for the base until the base read lands, so the rungs
  // draw in the same frame the window opens. Placing still waits for the real
  // base — see `ready` — so nothing measured from the stand-in can be placed.
  const hangsFrom =
    form.anchor === "click"
      ? (movedClickPx ?? state.px)
      : baseRead
        ? basePx
        : state.px

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

  const movePreview = React.useCallback(
    (anchorPx: number) => {
      if (!(anchorPx > 0)) return
      editedRef.current = true
      setShowValidation(false)
      // A hand-moved ladder no longer follows the confirmed base. The price
      // under the hand becomes the click price sent when Place is pressed.
      changeForm({ ...form, anchor: "click" })
      setMovedClickPx(anchorPx)
    },
    [changeForm, editedRef, form, setShowValidation]
  )

  const resizePreview = React.useCallback(
    (deepestPx: number) => {
      const currentDeepest = plan?.rungs.at(-1)?.px
      if (hangsFrom === null || currentDeepest === undefined) return
      const deviations = form.rungs.map((rung) => parsed(rung.value))
      if (deviations.some((value) => value === null)) return
      const resized = resizedDcaDeviations(
        deviations as number[],
        hangsFrom,
        currentDeepest,
        deepestPx
      )
      if (!resized) return

      editedRef.current = true
      setShowValidation(false)
      changeForm({
        ...form,
        rungs: form.rungs.map((rung, index) => ({
          ...rung,
          // Six places keeps the dropped line still after the percentages are
          // put back through the planner, without filling the boxes with noise.
          value: String(Number(resized[index].toFixed(6))),
        })),
      })
    },
    [changeForm, editedRef, form, hangsFrom, plan, setShowValidation]
  )

  const moveExitPreview = React.useCallback(
    (exitIndex: number, exitPx: number) => {
      if (!plan || hangsFrom === null) return
      const gapPct = exitLadderGapPctForPrice(
        { anchorPx: hangsFrom, rungs: plan.rungs },
        exitIndex,
        exitPx
      )
      if (gapPct === null) return
      editedRef.current = true
      setShowValidation(false)
      changeForm({
        ...form,
        exitGapPct: String(Number(gapPct.toFixed(6))),
      })
    },
    [changeForm, editedRef, form, hangsFrom, plan, setShowValidation]
  )

  const previewPlan = React.useMemo<DcaPreview | null>(
    () =>
      plan && hangsFrom !== null
        ? {
            anchorPx: hangsFrom,
            rungs: plan.rungs,
            exitGapPct:
              params?.takeProfit?.mode === "exitLadder"
                ? (params.takeProfit.exitGapPct ?? DEFAULT_DCA_EXIT_GAP_PCT)
                : null,
            onMove: movePreview,
            onResize: resizePreview,
            onMoveExit: moveExitPreview,
          }
        : null,
    [hangsFrom, moveExitPreview, movePreview, params, plan, resizePreview]
  )

  React.useEffect(() => {
    onPreview(previewPlan)
  }, [onPreview, previewPlan])
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

  const noBase = form.anchor === "base" && baseRead && basePx === null
  const underBase =
    form.anchor === "base" && basePx !== null && market.price < basePx

  const refusal = noBase
    ? "This market has no confirmed base yet, and the ladder hangs from one. Point it at the clicked price in Advanced settings, or wait for the chart to mark a base."
    : underBase
      ? `Price is already under the base at ${formatPrice(basePx as number)}, so that level has gone. The ladder starts when price is at or above a base and buys the fall from there.`
      : inspection.refusal
        ? inspection.refusal
        : !params
          ? "Finish the ladder settings before placing it."
          : plan && plan.tooSmallIndex !== null
            ? `Rung ${plan.tooSmallIndex + 1} is too small to be an order on this market. Use fewer rungs, a gentler ramp, or a bigger share.`
            : null

  const ready =
    (form.anchor === "click" || baseRead) &&
    !busy &&
    refusal === null &&
    plan !== null
  const blockedReason =
    refusal ??
    (form.anchor === "base" && !baseRead
      ? "Still reading the confirmed base for this market."
      : "Finish the ladder settings before placing it.")
  const submit = async () => {
    if (busy) return
    if (!ready || !params) {
      setShowValidation(true)
      showErrorToast(blockedReason)
      return
    }
    const placed = await onPlace({
      clickPx:
        form.anchor === "click" && hangsFrom !== null ? hangsFrom : state.px,
      interval,
      params,
    })
    // The server remembers these on placing; the browser's copy keeps the
    // next window from opening on anything older.
    if (placed) rememberDcaPrefs(params)
    if (placed) onClose()
  }

  return (
    <FloatingOrderWindow
      label={`DCA ladder on ${market.symbol}`}
      wide={wide}
      openedAt={state}
      width={ORDER_WINDOW_WIDTH}
      height={ORDER_WINDOW_HEIGHT}
      minimumHeight={MIN_ORDER_WINDOW_HEIGHT}
      title="DCA ladder"
      // The free cash and no wallet name, the grid window's header rule.
      free={free}
      chartPreviewControls
      // Open while the ladder's handles are dragged on the chart: nothing
      // outside closes it, and its own × does.
      persistent
      onClose={onClose}
    >
      <ScrollArea className="h-full">
        <div className="grid gap-4 p-3">
          <DcaSettingsFields
            idPrefix="smart"
            form={form}
            full
            interval={interval}
            busy={busy}
            showValidation={showValidation}
            inspection={inspection}
            suggestedSlPct={suggestedSlPct}
            plannedRungs={plan?.rungs}
            volumeCapped={plan?.volumeCapped}
            onChange={changeForm}
            onBlur={() => setShowValidation(true)}
          />
        </div>
      </ScrollArea>

      {/* Below the scroll, not in it: however many rungs the ladder has, the
            refusal and the button that explains it stay on screen. */}
      <div className="border-t p-3">
        {pairedWithGrid ? (
          <p className="pb-3 text-xs text-muted-foreground">
            This coin already has a grid. Placing this ladder pairs the two: the
            grid's stop must sit above this ladder's first buy, and on the
            exchange they still share one position — one pot of margin and one
            liquidation price. If this ladder falls far enough, the exchange can
            close the grid's coins with it.
          </p>
        ) : null}
        <OrderRefusal id="ladder-refusal" className="pb-3">
          {showValidation ? blockedReason : null}
        </OrderRefusal>
        <Button
          type="button"
          onClick={() => void submit()}
          aria-describedby={showValidation ? "ladder-refusal" : undefined}
          disabled={busy}
          className={cn("w-full", BUY_BUTTON)}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {/* "Long", not "buy" — Tyler's word for it, the way a short
              grid's entries are "shorts". */}
          {`Place${plan ? ` ${plan.rungs.length}` : ""} long${
            plan && plan.rungs.length === 1 ? "" : "s"
          }`}
        </Button>
      </div>
    </FloatingOrderWindow>
  )
}
