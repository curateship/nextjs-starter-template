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
  orderWindowBeside,
  useOrderWindowForm,
} from "@/components/trade/order-window-form"
import { OrderRefusal } from "@/components/trade/order-refusal"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  CANDLE_INTERVALS,
  marketSymbol,
  type CandleInterval,
  type MarketRow,
} from "@/lib/protocols/contracts"
import {
  DEFAULT_DCA_STOP_LOSS_PCT,
  DEFAULT_DCA_TAKE_PROFIT_PCT,
  dcaLadderPlan,
  dcaLadderSettingsFromPlan,
  ladderShapeMovable,
  rungBudget,
  type DcaLadderSettings,
  type DcaParams,
} from "@/lib/trade/dca"
import { bracketPercent } from "@/lib/trade/brackets"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import type { TradePosition } from "@/lib/trade/paper"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Settings for a placed ladder, anchored beside the chart control that opened it. */
export function SmartLadderSettingsWindow({
  ladder,
  anchor = null,
  wide = true,
  wallet,
  equity,
  market,
  interval,
  position,
  busy,
  onSaveExits,
  onReshape,
  onClose,
}: {
  ladder: SmartLadder | null
  anchor?: Element | null
  wide?: boolean
  wallet: string
  equity: number | null
  market: MarketRow | null
  interval: CandleInterval
  position: TradePosition | null
  busy: boolean
  onSaveExits: (
    ladder: SmartLadder,
    exits: {
      takeProfit: DcaParams["takeProfit"]
      stopLoss: DcaParams["stopLoss"]
    }
  ) => Promise<boolean>
  onReshape: (
    ladder: SmartLadder,
    change: {
      settings: DcaLadderSettings
      greenInterval: CandleInterval
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  if (!ladder) return null

  return (
    <FloatingOrderWindow
      label={`Settings for the ${marketSymbol(ladder.marketKey)} DCA ladder`}
      wide={wide}
      openedAt={orderWindowBeside(anchor)}
      width={ORDER_WINDOW_WIDTH}
      height={ORDER_WINDOW_HEIGHT}
      minimumHeight={MIN_ORDER_WINDOW_HEIGHT}
      title="DCA ladder settings"
      wallet={wallet}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <SettingsForm
        key={ladder.id}
        ladder={ladder}
        equity={equity}
        market={market}
        interval={interval}
        position={position}
        busy={busy}
        onSaveExits={onSaveExits}
        onReshape={onReshape}
        onClose={onClose}
      />
    </FloatingOrderWindow>
  )
}

function SettingsForm({
  ladder,
  equity,
  market,
  interval,
  position,
  busy,
  onSaveExits,
  onReshape,
  onClose,
}: {
  ladder: SmartLadder
  equity: number | null
  market: MarketRow | null
  interval: CandleInterval
  position: TradePosition | null
  busy: boolean
  onSaveExits: (
    ladder: SmartLadder,
    exits: {
      takeProfit: DcaParams["takeProfit"]
      stopLoss: DcaParams["stopLoss"]
    }
  ) => Promise<boolean>
  onReshape: (
    ladder: SmartLadder,
    change: {
      settings: DcaLadderSettings
      greenInterval: CandleInterval
    }
  ) => Promise<boolean>
  onClose: () => void
}) {
  const plan = ladder.plan
  const full = ladderShapeMovable(plan)
  const takeProfitFixed = plan.takeProfit?.mode === "fixed"
  const stopLossFixed = plan.stopLoss?.mode === "fixed"
  const settingsInterval =
    CANDLE_INTERVALS.find((one) => one === plan.greenInterval) ?? interval
  const [form, setForm] = React.useState(() => {
    const next = dcaSettingsFormState(
      dcaLadderSettingsFromPlan(plan, equity ?? 0)
    )
    if (takeProfitFixed) {
      next.tpPct =
        bracketPercent(position?.entryPx ?? 0, position?.tpPx ?? null) ||
        String(DEFAULT_DCA_TAKE_PROFIT_PCT)
    }
    if (stopLossFixed) {
      next.slPct =
        bracketPercent(position?.entryPx ?? 0, position?.slPx ?? null) ||
        String(DEFAULT_DCA_STOP_LOSS_PCT)
    }
    return next
  })
  const { touched, showValidation, setShowValidation } = useOrderWindowForm()
  const changeForm = React.useCallback(
    (next: typeof form) => touched(setForm)(next),
    [touched]
  )
  const maxBorrowing = Math.max(
    plan.leverage,
    Math.min(50, Math.floor(plan.maxLeverage))
  )
  const inspection = React.useMemo(
    () => inspectDcaSettingsForm(form, maxBorrowing, full),
    [form, full, maxBorrowing]
  )
  const preview = React.useMemo(
    () =>
      full && inspection.settings && equity !== null
        ? dcaLadderPlan({
            anchorPx: plan.anchorPx,
            equity,
            params: inspection.settings,
            sizeDecimals: plan.sizeDecimals,
            volume24hUsd: market?.volume24hUsd ?? null,
          })
        : null,
    [equity, full, inspection.settings, market?.volume24hUsd, plan]
  )
  const suggestedSlPct =
    preview && preview.rungs.length > 0
      ? Math.min(
          98,
          Math.ceil(
            (1 -
              preview.rungs[preview.rungs.length - 1].px /
                preview.rungs[0].px) *
              100
          ) + 2
        )
      : DEFAULT_DCA_STOP_LOSS_PCT

  const save = async () => {
    if (busy) return
    const valid = full
      ? inspection.settings !== null
      : inspection.exits !== null
    if (!valid) {
      setShowValidation(true)
      if (inspection.refusal) showErrorToast(inspection.refusal)
      return
    }
    let saved: boolean
    if (full) {
      if (!inspection.settings) return
      saved = await onReshape(ladder, {
        settings: inspection.settings,
        greenInterval: settingsInterval,
      })
    } else {
      if (!inspection.exits) return
      saved = await onSaveExits(ladder, inspection.exits)
    }
    if (saved) onClose()
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="grid gap-4 p-3">
          {full ? null : (
            <p className="text-xs text-muted-foreground">
              This ladder has started. Its rungs and position size are frozen,
              but take profit and stop loss can still change.
            </p>
          )}
          <DcaSettingsFields
            idPrefix="ladder"
            form={form}
            full={full}
            interval={settingsInterval}
            busy={busy}
            showValidation={showValidation}
            inspection={inspection}
            suggestedSlPct={suggestedSlPct}
            plannedRungs={
              preview?.rungs ??
              plan.rungs.map((rung) => ({ dollars: rungBudget(rung) }))
            }
            volumeCapped={preview?.volumeCapped}
            takeProfitFixed={takeProfitFixed}
            stopLossFixed={stopLossFixed}
            onChange={changeForm}
            onBlur={() => setShowValidation(true)}
          />
        </div>
      </ScrollArea>
      <div className="border-t p-3">
        <OrderRefusal id="ladder-settings-refusal" className="pb-3">
          {showValidation ? inspection.refusal : null}
        </OrderRefusal>
        <Button
          type="button"
          className="w-full"
          aria-describedby={
            showValidation && inspection.refusal
              ? "ladder-settings-refusal"
              : undefined
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
