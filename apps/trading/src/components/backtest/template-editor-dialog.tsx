import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { AdditionalMarketsField } from "@/components/backtest/additional-markets-field"
import {
  FeeLabel,
  StrategyParamCards,
  feeCostTip,
  feePctTip,
  orderSizeFromValues,
} from "@/components/backtest/run-config-fields"
import { pctToBps } from "@/components/backtest/template-config"
import { StrategyParamFields } from "@/components/bots/strategy-param-fields"
import {
  PARAM_DEFAULTS,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  saveStrategyDefaults,
  saveStrategyTemplate,
  type StrategyRunDefaults,
  type StrategyTemplate,
} from "@/lib/api/backtests"
import {
  DEFAULT_BACKTEST_COSTS,
  MAX_BACKTEST_BARS,
  maxWindowDays,
} from "@/lib/backtest/types"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

/** Whether the editor is bound to a strategy's main default or a named template. */
export type EditorTarget =
  | { mode: "default" }
  | { mode: "template"; template?: StrategyTemplate }

/**
 * Edits one run configuration — either a strategy's main default or a named
 * template. The Templates dashboard owns picking, duplicating, and deleting;
 * this dialog only edits the config it is handed. Mount with a `key` tied to
 * the target so state resets between rows.
 */
export function TemplateEditorDialog({
  strategy,
  target,
  seed,
  open,
  onOpenChange,
  onSaved,
}: {
  strategy: StrategyType
  target: EditorTarget
  /** Config to seed the form: the current default, or the template's config. */
  seed: StrategyRunDefaults
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isTemplate = target.mode === "template"
  const existingTemplateId =
    target.mode === "template" ? target.template?.id : undefined

  const [values, setValues] = React.useState<ParamValues>(
    () => ({ ...PARAM_DEFAULTS[strategy], ...seed.params } as ParamValues)
  )
  const [interval, setTimeframe] = React.useState<CandleInterval>(
    (seed.interval as CandleInterval | undefined) ?? "15m"
  )
  const [windowDays, setWindowDays] = React.useState(String(seed.windowDays ?? 30))
  const [equity, setEquity] = React.useState(String(seed.equity ?? 10_000))
  const [taker, setTaker] = React.useState(
    String(seed.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(seed.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(seed.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  // Optional blended fee %; when non-empty it overrides taker + maker bps.
  const [feePct, setFeePct] = React.useState(
    seed.feePct != null ? String(seed.feePct) : ""
  )
  const [market, setMarket] = React.useState(seed.market ?? "BTC")
  const [extraMarkets, setExtraMarkets] = React.useState<string[]>(
    seed.extraMarkets ?? []
  )
  const [name, setName] = React.useState(
    target.mode === "template" ? (target.template?.name ?? "") : ""
  )
  const markets = useBinanceMarketRows()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const orderSizeUsd = orderSizeFromValues(values)
  const feeOverride = feePct.trim() !== ""
  const blendedBps =
    feeOverride && Number.isFinite(Number(feePct))
      ? String(pctToBps(Number(feePct)))
      : ""

  /** Validate the form and build the run config, or set an error and return null. */
  function buildConfig(): StrategyRunDefaults | null {
    setError(null)
    const windowNum = Number(windowDays)
    const equityNum = Number(equity)
    const takerNum = Number(taker)
    const makerNum = Number(maker)
    const slipNum = Number(slippage)
    if (!(windowNum >= 1 && windowNum <= maxWindowDays(interval, MAX_BACKTEST_BARS))) {
      setError(
        `Date range for ${interval} must be between 1 and ${maxWindowDays(interval, MAX_BACKTEST_BARS)} days.`
      )
      return null
    }
    if (!(equityNum > 0)) {
      setError("Starting amount must be positive.")
      return null
    }
    let takerBps = takerNum
    let makerBps = makerNum
    if (feeOverride) {
      const p = Number(feePct)
      if (!(p >= 0 && p <= 0.5)) {
        setError("Fee % must be between 0 and 0.5% (0–50 bps).")
        return null
      }
      takerBps = pctToBps(p)
      makerBps = pctToBps(p)
    } else if (
      !(takerNum >= 0 && takerNum <= 50) ||
      !(makerNum >= 0 && makerNum <= 50)
    ) {
      setError("Fees must be between 0 and 50 bps.")
      return null
    }
    if (!(slipNum >= 0 && slipNum <= 100)) {
      setError("Slippage must be between 0 and 100 bps.")
      return null
    }
    return {
      params: values,
      interval,
      windowDays: Math.round(windowNum),
      equity: equityNum,
      takerFeeBps: takerBps,
      makerFeeBps: makerBps,
      slippageBps: slipNum,
      feePct: feeOverride ? Number(feePct) : undefined,
      market,
      // Grid bounds are absolute prices, so a grid config stays single-market.
      extraMarkets:
        strategy === "grid" || extraMarkets.length === 0 ? undefined : extraMarkets,
    }
  }

  async function save() {
    const config = buildConfig()
    if (!config) return
    setBusy(true)
    try {
      if (isTemplate) {
        const trimmed = name.trim()
        if (!trimmed) {
          setError("Enter a template name.")
          setBusy(false)
          return
        }
        await saveStrategyTemplate({
          id: existingTemplateId,
          strategyType: strategy,
          name: trimmed,
          // Keep the pin state, which lives on the template config.
          config: { ...config, pinned: seed.pinned },
        })
      } else {
        // Preserve the strategy's name/type overrides + pin (set elsewhere).
        await saveStrategyDefaults({
          strategyType: strategy,
          defaults: {
            ...config,
            name: seed.name,
            strategyName: seed.strategyName,
            strategyKind: seed.strategyKind,
            pinned: seed.pinned,
          },
        })
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const heading = isTemplate
    ? existingTemplateId
      ? "Edit template"
      : `New ${STRATEGY_LABELS[strategy]} template`
    : `${STRATEGY_LABELS[strategy]} default`

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {isTemplate
              ? "A saved starting point you can pick when starting a New Run."
              : "New runs with this strategy start from these values."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <TooltipProvider>
            {isTemplate ? (
              <div className="grid gap-2">
                <Label>Template name</Label>
                <Input
                  className="h-8"
                  placeholder="Template name"
                  value={name}
                  disabled={busy}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            ) : null}

            <div className="grid gap-3 rounded-lg border p-4">
              <Label>General settings</Label>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Market</Label>
                  <Select
                    value={market}
                    disabled={busy}
                    onValueChange={(coin) => {
                      setMarket(coin)
                      setExtraMarkets((current) =>
                        current.filter((extra) => extra !== coin)
                      )
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(markets.length > 0
                        ? markets.map((row) => row.coin)
                        : [market]
                      ).map((coin) => (
                        <SelectItem key={coin} value={coin}>
                          {coin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Timeframe</Label>
                  <Select
                    value={interval}
                    disabled={busy}
                    onValueChange={(value) => setTimeframe(value as CandleInterval)}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANDLE_INTERVALS.map((tf) => (
                        <SelectItem key={tf} value={tf}>
                          {tf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>
                    Date range (days back, 1–{maxWindowDays(interval, MAX_BACKTEST_BARS)})
                  </Label>
                  <Input
                    className="h-8"
                    value={windowDays}
                    inputMode="numeric"
                    disabled={busy}
                    onChange={(event) => setWindowDays(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Starting amount (USD)</Label>
                  <Input
                    className="h-8"
                    value={equity}
                    inputMode="decimal"
                    disabled={busy}
                    onChange={(event) => setEquity(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <FeeLabel
                    text="Slippage (bps, taker fills)"
                    tip={feeCostTip(slippage, orderSizeUsd)}
                  />
                  <Input
                    className="h-8"
                    value={slippage}
                    inputMode="decimal"
                    disabled={busy}
                    onChange={(event) => setSlippage(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <FeeLabel
                    text="Taker fee (bps)"
                    tip={
                      feeOverride
                        ? "Overridden by the blended Fee %."
                        : feeCostTip(taker, orderSizeUsd)
                    }
                  />
                  <Input
                    className="h-8"
                    value={feeOverride ? blendedBps : taker}
                    inputMode="decimal"
                    disabled={busy || feeOverride}
                    onChange={(event) => setTaker(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <FeeLabel
                    text="Maker fee (bps)"
                    tip={
                      feeOverride
                        ? "Overridden by the blended Fee %."
                        : feeCostTip(maker, orderSizeUsd)
                    }
                  />
                  <Input
                    className="h-8"
                    value={feeOverride ? blendedBps : maker}
                    inputMode="decimal"
                    disabled={busy || feeOverride}
                    onChange={(event) => setMaker(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <FeeLabel text="Fee % (optional)" tip={feePctTip(feePct, orderSizeUsd)} />
                  <Input
                    className="h-8"
                    value={feePct}
                    inputMode="decimal"
                    placeholder="e.g. 0.045"
                    disabled={busy}
                    onChange={(event) => setFeePct(event.target.value.trim())}
                  />
                </div>
                {strategy === "qqe" ? (
                  <StrategyParamFields
                    strategy={strategy}
                    values={values}
                    disabled={busy}
                    mid={0}
                    section="size"
                    onChange={(key, value) =>
                      setValues((current) => ({ ...current, [key]: value }))
                    }
                  />
                ) : null}
              </div>
              <AdditionalMarketsField
                market={market}
                extraMarkets={extraMarkets}
                markets={markets}
                disabled={busy}
                isGrid={strategy === "grid"}
                onChange={setExtraMarkets}
              />
            </div>

            <StrategyParamCards
              strategy={strategy}
              values={values}
              disabled={busy}
              onChange={(key, value) =>
                setValues((current) => ({ ...current, [key]: value }))
              }
            />

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </TooltipProvider>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {isTemplate
              ? existingTemplateId
                ? "Save template"
                : "Create template"
              : "Save default"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
