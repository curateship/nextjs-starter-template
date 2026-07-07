import * as React from "react"
import { CopyIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { AdditionalMarketsField } from "@/components/backtest/additional-markets-field"
import {
  FeeLabel,
  StrategyParamCards,
  feeCostTip,
  feePctTip,
  orderSizeFromValues,
} from "@/components/backtest/run-config-fields"
import { pctToBps, uniqueCopyName } from "@/components/backtest/template-config"
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
  deleteStrategyTemplate,
  saveStrategyDefaults,
  saveStrategyTemplate,
  type StrategyRunDefaults,
  type StrategyTemplate,
} from "@/lib/api/backtests"
import { useShellRuntime } from "@/components/shell-layout"
import { DEFAULT_BACKTEST_COSTS, maxWindowDays } from "@/lib/backtest/types"
import { useMarketRows } from "@/lib/hl/hooks"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

/**
 * Edits a strategy's default run configuration — parameters plus timeframe,
 * date range, equity, and fee/slippage assumptions. Every New Run for the
 * strategy seeds from these. Mount with `key={strategy}` so state resets.
 */
/** Template dropdown sentinels — distinct from any real template id. */
const MAIN_DEFAULT = "__default__"
const NEW_TEMPLATE = "__new__"

export function StrategyDefaultsDialog({
  strategy,
  initial,
  templates,
  open,
  onOpenChange,
  onSaved,
}: {
  strategy: StrategyType
  /** Current seeds: built-ins overlaid with the user's saved defaults. */
  initial: StrategyRunDefaults
  /** This strategy's saved templates, for the dropdown. */
  templates: StrategyTemplate[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [values, setValues] = React.useState<ParamValues>(initial.params)
  const [interval, setTimeframe] = React.useState<CandleInterval>(
    initial.interval ?? "15m"
  )
  const [windowDays, setWindowDays] = React.useState(
    String(initial.windowDays ?? 30)
  )
  const [equity, setEquity] = React.useState(String(initial.equity ?? 10_000))
  const [taker, setTaker] = React.useState(
    String(initial.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(initial.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(initial.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  // Optional blended fee %; when non-empty it overrides taker + maker bps.
  const [feePct, setFeePct] = React.useState(
    initial.feePct != null ? String(initial.feePct) : ""
  )
  const [market, setMarket] = React.useState(initial.market ?? "BTC")
  const [extraMarkets, setExtraMarkets] = React.useState<string[]>(
    initial.extraMarkets ?? []
  )
  const markets = useMarketRows("mainnet")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Which config the form is bound to: main default, an existing template
  // (its id), or a not-yet-saved new template.
  const [selection, setSelection] = React.useState<string>(MAIN_DEFAULT)
  // Editable label for the current selection: the main default's display name,
  // an existing template's name, or the new template's name.
  const [configName, setConfigName] = React.useState(initial.name ?? "")
  const maxCandles = useShellRuntime().config.maxCandles

  const mainDefaultLabel = initial.name?.trim() || "Main default"

  const editingTemplate = selection !== MAIN_DEFAULT
  const existingTemplateId =
    selection !== MAIN_DEFAULT && selection !== NEW_TEMPLATE ? selection : undefined

  /** Load a stored config into the form fields. */
  function applyConfig(config: StrategyRunDefaults) {
    setValues({ ...PARAM_DEFAULTS[strategy], ...config.params } as ParamValues)
    setTimeframe((config.interval as CandleInterval | undefined) ?? "15m")
    setWindowDays(String(config.windowDays ?? 30))
    setEquity(String(config.equity ?? 10_000))
    setTaker(String(config.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps))
    setMaker(String(config.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps))
    setSlippage(String(config.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps))
    setFeePct(config.feePct != null ? String(config.feePct) : "")
    setMarket(config.market ?? "BTC")
    setExtraMarkets(config.extraMarkets ?? [])
  }

  const orderSizeUsd = orderSizeFromValues(values)
  const feeOverride = feePct.trim() !== ""
  // The bps that the blended % resolves to, shown in the disabled taker/maker fields.
  const blendedBps =
    feeOverride && Number.isFinite(Number(feePct))
      ? String(pctToBps(Number(feePct)))
      : ""

  function selectTemplate(value: string) {
    setError(null)
    setSelection(value)
    if (value === MAIN_DEFAULT) {
      applyConfig(initial)
      setConfigName(initial.name ?? "")
    } else if (value === NEW_TEMPLATE) {
      // Keep the current form values as the starting point for the new template.
      setConfigName("")
    } else {
      const template = templates.find((row) => row.id === value)
      if (template) {
        applyConfig(template.config)
        setConfigName(template.name)
      }
    }
  }


  function resetToBuiltIns() {
    setSelection(MAIN_DEFAULT)
    setConfigName("")
    setValues(PARAM_DEFAULTS[strategy])
    setTimeframe("15m")
    setWindowDays("30")
    setEquity("10000")
    setTaker(String(DEFAULT_BACKTEST_COSTS.takerFeeBps))
    setMaker(String(DEFAULT_BACKTEST_COSTS.makerFeeBps))
    setSlippage(String(DEFAULT_BACKTEST_COSTS.slippageBps))
    setFeePct("")
    setMarket("BTC")
    setExtraMarkets([])
  }

  /** Validate the form and build the run config, or set an error and return null. */
  function buildConfig(): StrategyRunDefaults | null {
    setError(null)
    const windowNum = Number(windowDays)
    const equityNum = Number(equity)
    const takerNum = Number(taker)
    const makerNum = Number(maker)
    const slipNum = Number(slippage)
    if (!(windowNum >= 1 && windowNum <= maxWindowDays(interval, maxCandles))) {
      setError(
        `Date range for ${interval} must be between 1 and ${maxWindowDays(interval, maxCandles)} days.`
      )
      return null
    }
    if (!(equityNum > 0)) {
      setError("Starting equity must be positive.")
      return null
    }
    // A blended fee % overrides the individual taker/maker bps.
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

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function saveDefaults() {
    const config = buildConfig()
    if (!config) return
    const named = { ...config, name: configName.trim() || undefined }
    await run(() => saveStrategyDefaults({ strategyType: strategy, defaults: named }))
  }

  async function saveTemplate() {
    const name = configName.trim()
    if (!name) {
      setError("Enter a template name.")
      return
    }
    const config = buildConfig()
    if (!config) return
    await run(() =>
      saveStrategyTemplate({
        id: existingTemplateId,
        strategyType: strategy,
        name,
        config,
      })
    )
  }

  async function deleteTemplate() {
    if (!existingTemplateId) return
    await run(() => deleteStrategyTemplate(existingTemplateId))
  }

  async function duplicateTemplate() {
    if (selection === NEW_TEMPLATE) return
    const config = buildConfig()
    if (!config) return
    const name = uniqueCopyName(
      configName.trim() || "Main default",
      templates.map((row) => row.name)
    )
    await run(() => saveStrategyTemplate({ strategyType: strategy, name, config }))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{STRATEGY_LABELS[strategy]} defaults</DialogTitle>
          <DialogDescription>
            New runs with this strategy start from these values.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <TooltipProvider>
          <div className="grid gap-2">
            <Label>Template</Label>
            <div className="flex gap-2">
              <Select
                value={selection}
                disabled={busy}
                onValueChange={selectTemplate}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MAIN_DEFAULT}>{mainDefaultLabel}</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_TEMPLATE}>+ New template</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8 flex-1"
                placeholder={editingTemplate ? "Template name" : "Main default"}
                value={configName}
                disabled={busy}
                maxLength={80}
                onChange={(event) => setConfigName(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The main default seeds every New Run unless you pick a template.
            </p>
          </div>

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
                Date range (days back, 1–{maxWindowDays(interval, maxCandles)})
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
              <Label>Starting equity (USD)</Label>
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
        <DialogFooter>
          <div className="mr-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={resetToBuiltIns}
            >
              Reset to built-ins
            </Button>
            {selection !== NEW_TEMPLATE ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void duplicateTemplate()}
              >
                <CopyIcon className="size-4" />
                Duplicate template
              </Button>
            ) : null}
            {existingTemplateId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void deleteTemplate()}
              >
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {editingTemplate ? (
            <Button type="button" disabled={busy} onClick={() => void saveTemplate()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {existingTemplateId ? "Save template" : "Create template"}
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void saveDefaults()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save defaults
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
