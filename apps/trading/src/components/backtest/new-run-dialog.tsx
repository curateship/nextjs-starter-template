import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  ChevronDownIcon,
  Loader2Icon,
  PinIcon,
} from "lucide-react"

import { AdditionalMarketsField } from "@/components/backtest/additional-markets-field"
import { RunStatusMenuItems } from "@/components/backtest/run-status-menu"
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
  buildParams,
  INTERVAL_STRATEGIES,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  updateRunStatus,
  type StrategyDefaultsMap,
  type StrategyRunDefaults,
  type StrategyTemplate,
} from "@/lib/api/backtests"
import { useShellRuntime } from "@/components/shell-layout"
import { DEFAULT_BACKTEST_COSTS, maxWindowDays } from "@/lib/backtest/types"
import type { MarketRow } from "@/lib/hl/hooks"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyParamsSchema,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

import type { RunDraft } from "./run-draft"

/** Backtestable strategies; copy needs event replay and stays live-only. */
const STRATEGY_CHOICES: StrategyType[] = ["momentum", "qqe", "grid", "dca"]

/** Default grid range: ±10% around the market's mid. */
function gridBounds(mid: number) {
  return {
    lowerPx: (mid * 0.9).toPrecision(5),
    upperPx: (mid * 1.1).toPrecision(5),
  }
}

/**
 * Configures a run draft: name → strategy → markets → parameters. Continue
 * hands the draft to the chart workspace (main market), where price levels
 * can be tuned visually before Run Backtest executes the config on every
 * selected market (one result per market).
 */
export function NewRunDialog({
  open,
  onOpenChange,
  markets,
  defaultMarket,
  defaultInterval,
  defaultStrategy = "momentum",
  userDefaults,
  templates,
  initial,
  lockStrategy = false,
  statusTarget,
  title = "New Backtest Run",
  description = "Name the run, pick a strategy and markets, then set its parameters. Continue to fine-tune price levels on the chart before running.",
  submitLabel = "Continue",
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  markets: MarketRow[]
  defaultMarket: string
  defaultInterval: CandleInterval
  defaultStrategy?: StrategyType
  /** Per-user parameter seeds (Strategies → settings), over the built-ins. */
  userDefaults?: StrategyDefaultsMap
  /** Saved run-config templates (all strategies); filtered to the picked one. */
  templates?: StrategyTemplate[]
  /** Full seed config (edit mode) — overrides the defaults above. */
  initial?: RunDraft
  /** Edit mode: a run group's strategy can't change on re-run. */
  lockStrategy?: boolean
  /** Edit mode: enables an inline triage-status control for this run group. */
  statusTarget?: {
    groupId: string
    reviewStatus: "review" | "archived"
    pinned: boolean
  }
  title?: string
  description?: string
  submitLabel?: string
  /** Async handlers keep the dialog open with a spinner until they resolve. */
  onContinue: (draft: RunDraft) => void | Promise<void>
}) {
  const { config } = useShellRuntime()
  const maxCandles = config.maxCandles
  /** Built-ins overlaid with the user's saved defaults for a strategy. */
  const seedFor = React.useCallback(
    (type: StrategyType): StrategyRunDefaults => {
      const stored = userDefaults?.[type]
      return {
        ...stored,
        params: { ...PARAM_DEFAULTS[type], ...(stored?.params ?? {}) },
      }
    },
    [userDefaults]
  )

  const initialStrategy =
    initial?.strategy ??
    (defaultStrategy === "copy" ? "momentum" : defaultStrategy)
  const initialSeed = seedFor(initialStrategy)
  const initialInterval =
    initial?.interval ?? initialSeed.interval ?? defaultInterval

  const [name, setName] = React.useState(initial?.name ?? "")
  const [strategy, setStrategy] = React.useState<StrategyType>(initialStrategy)
  const [market, setMarket] = React.useState(
    initial?.market ?? initialSeed.market ?? defaultMarket
  )
  const [extraMarkets, setExtraMarkets] = React.useState<string[]>(
    initial?.extraMarkets ?? initialSeed.extraMarkets ?? []
  )
  const [interval, setTimeframe] = React.useState<CandleInterval>(initialInterval)
  const [windowDays, setWindowDays] = React.useState(
    String(initial?.windowDays ?? initialSeed.windowDays ?? 30)
  )
  const [equity, setEquity] = React.useState(
    String(initial?.equity ?? initialSeed.equity ?? 10_000)
  )
  const [taker, setTaker] = React.useState(
    String(
      initial?.takerFeeBps ??
        initialSeed.takerFeeBps ??
        DEFAULT_BACKTEST_COSTS.takerFeeBps
    )
  )
  const [maker, setMaker] = React.useState(
    String(
      initial?.makerFeeBps ??
        initialSeed.makerFeeBps ??
        DEFAULT_BACKTEST_COSTS.makerFeeBps
    )
  )
  const [slippage, setSlippage] = React.useState(
    String(
      initial?.slippageBps ??
        initialSeed.slippageBps ??
        DEFAULT_BACKTEST_COSTS.slippageBps
    )
  )
  const [params, setParams] = React.useState<ParamValues>(() => {
    const seedParams = initial?.params ?? initialSeed.params
    return INTERVAL_STRATEGIES.includes(initialStrategy)
      ? { ...seedParams, interval: initialInterval }
      : seedParams
  })
  // Optional blended fee %; when non-empty it overrides taker + maker bps.
  const [feePct, setFeePct] = React.useState(
    initialSeed.feePct != null ? String(initialSeed.feePct) : ""
  )
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Optimistic triage state for the edit-mode status control.
  const router = useRouter()
  const [runStatus, setRunStatus] = React.useState(statusTarget)

  async function changeStatus(patch: {
    reviewStatus?: "review" | "archived"
    pinned?: boolean
  }) {
    if (!runStatus) return
    setRunStatus({ ...runStatus, ...patch })
    await updateRunStatus({ groupIds: [runStatus.groupId], ...patch })
    await router.invalidate()
  }

  const midOf = (coin: string) =>
    Number(markets.find((row) => row.coin === coin)?.markPx ?? 0)
  const mid = midOf(market)

  const orderSizeUsd = orderSizeFromValues(params)
  const feeOverride = feePct.trim() !== ""
  const blendedBps =
    feeOverride && Number.isFinite(Number(feePct))
      ? String(pctToBps(Number(feePct)))
      : ""

  const [templateId, setTemplateId] = React.useState<string>("__default__")
  const strategyTemplates = (templates ?? []).filter(
    (row) => row.strategyType === strategy
  )

  /** Apply a run-config seed (default or template) into the form for `next`. */
  function applySeed(next: StrategyType, seed: StrategyRunDefaults) {
    const nextInterval = seed.interval ?? interval
    setTimeframe(nextInterval)
    if (seed.market) setMarket(seed.market)
    // Grid is single-market; other strategies replay the seeded basket.
    setExtraMarkets(next === "grid" ? [] : (seed.extraMarkets ?? []))
    if (seed.windowDays) setWindowDays(String(seed.windowDays))
    if (seed.equity) setEquity(String(seed.equity))
    if (seed.takerFeeBps !== undefined) setTaker(String(seed.takerFeeBps))
    if (seed.makerFeeBps !== undefined) setMaker(String(seed.makerFeeBps))
    if (seed.slippageBps !== undefined) setSlippage(String(seed.slippageBps))
    setFeePct(seed.feePct != null ? String(seed.feePct) : "")
    if (INTERVAL_STRATEGIES.includes(next)) {
      setParams({ ...seed.params, interval: nextInterval })
    } else if (
      next === "grid" &&
      !seed.params.lowerPx &&
      !seed.params.upperPx &&
      mid > 0
    ) {
      setParams({ ...seed.params, ...gridBounds(mid) })
    } else {
      setParams(seed.params)
    }
  }

  function selectStrategy(next: StrategyType) {
    if (lockStrategy) return
    setStrategy(next)
    setError(null)
    setTemplateId("__default__")
    // Grid bounds are absolute prices — a grid config can't span markets.
    if (next === "grid") setExtraMarkets([])
    applySeed(next, seedFor(next))
  }

  function selectTemplate(id: string) {
    setTemplateId(id)
    setError(null)
    if (id === "__default__") {
      applySeed(strategy, seedFor(strategy))
      return
    }
    const template = strategyTemplates.find((row) => row.id === id)
    if (!template) return
    applySeed(strategy, {
      ...template.config,
      params: { ...PARAM_DEFAULTS[strategy], ...template.config.params },
    })
  }

  function selectMarket(coin: string) {
    setMarket(coin)
    setExtraMarkets((current) => current.filter((extra) => extra !== coin))
    if (strategy === "grid") {
      const coinMid = midOf(coin)
      if (coinMid > 0) {
        setParams((current) => ({ ...current, ...gridBounds(coinMid) }))
      }
    }
  }

  function selectTimeframe(next: CandleInterval) {
    setTimeframe(next)
    if (INTERVAL_STRATEGIES.includes(strategy)) {
      setParams((current) => ({ ...current, interval: next }))
    }
  }

  function changeParam(key: string, value: string) {
    setParams((current) => ({ ...current, [key]: value }))
    if (key === "interval" && INTERVAL_STRATEGIES.includes(strategy)) {
      setTimeframe(value as CandleInterval)
    }
  }

  function submit() {
    setError(null)
    const parsed = strategyParamsSchema.safeParse(buildParams(strategy, params))
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) =>
            issue.path.length
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join(" · ")
      )
      return
    }
    const equityNum = Number(equity)
    const windowNum = Number(windowDays)
    let takerNum = Number(taker)
    let makerNum = Number(maker)
    const slipNum = Number(slippage)
    const maxWindow = maxWindowDays(interval, maxCandles)
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(windowNum >= 1 && windowNum <= maxWindow)) {
      return setError(
        `Date range for ${interval} must be between 1 and ${maxWindow} days (max ${maxCandles} candles — change in Settings).`
      )
    }
    // A blended fee % overrides the individual taker/maker bps.
    if (feeOverride) {
      const p = Number(feePct)
      if (!(p >= 0 && p <= 0.5)) {
        return setError("Fee % must be between 0 and 0.5% (0–50 bps).")
      }
      takerNum = pctToBps(p)
      makerNum = pctToBps(p)
    } else if (
      !(takerNum >= 0 && takerNum <= 50) ||
      !(makerNum >= 0 && makerNum <= 50)
    ) {
      return setError("Fees must be between 0 and 50 bps.")
    }
    if (!(slipNum >= 0 && slipNum <= 100)) {
      return setError("Slippage must be between 0 and 100 bps.")
    }
    if (strategy === "copy") return

    const draft: RunDraft = {
      name: name.trim() || undefined,
      strategy,
      market,
      extraMarkets: extraMarkets.length ? extraMarkets : undefined,
      interval,
      windowDays: Math.round(windowNum),
      equity: equityNum,
      takerFeeBps: takerNum,
      makerFeeBps: makerNum,
      slippageBps: slipNum,
      params,
    }
    setBusy(true)
    void (async () => {
      try {
        await onContinue(draft)
        onOpenChange(false)
        setName(initial?.name ?? "")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Run failed")
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <TooltipProvider>
          <div className="grid gap-2">
            <Label htmlFor="run-name">
              Run name{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="run-name"
              value={name}
              placeholder="Auto-named from strategy · market · timeframe"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {runStatus ? (
            <div className="grid gap-2">
              <Label>Status</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-fit justify-between gap-2 capitalize"
                  >
                    {runStatus.pinned ? <PinIcon className="size-4" /> : null}
                    {runStatus.reviewStatus}
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <RunStatusMenuItems
                    onApply={(patch) => void changeStatus(patch)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Strategy</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGY_CHOICES.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={lockStrategy && type !== strategy}
                  onClick={() => selectStrategy(type)}
                  className={cn(
                    "rounded-md border p-3 text-left text-sm hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40",
                    strategy === type && "border-primary bg-muted"
                  )}
                >
                  <div className="font-medium">{STRATEGY_LABELS[type]}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {STRATEGY_DESCRIPTIONS[type]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {strategyTemplates.length > 0 ? (
            <div className="grid gap-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={selectTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Main default</SelectItem>
                  {strategyTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 rounded-lg border p-4">
            <Label>General settings</Label>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Market</Label>
                <Select value={market} onValueChange={selectMarket}>
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
                  onValueChange={(value) => selectTimeframe(value as CandleInterval)}
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
                <Label htmlFor="run-window">
                  Date range (days back, 1–{maxWindowDays(interval, maxCandles)})
                </Label>
                <Input
                  id="run-window"
                  className="h-8"
                  value={windowDays}
                  inputMode="numeric"
                  onChange={(event) => setWindowDays(event.target.value.trim())}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="run-equity">Starting equity (USD)</Label>
                <Input
                  id="run-equity"
                  className="h-8"
                  value={equity}
                  inputMode="decimal"
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
                  disabled={feeOverride}
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
                  disabled={feeOverride}
                  onChange={(event) => setMaker(event.target.value.trim())}
                />
              </div>
              <div className="grid gap-2">
                <FeeLabel
                  text="Fee % (optional)"
                  tip={feePctTip(feePct, orderSizeUsd)}
                />
                <Input
                  className="h-8"
                  value={feePct}
                  inputMode="decimal"
                  placeholder="e.g. 0.045"
                  onChange={(event) => setFeePct(event.target.value.trim())}
                />
              </div>
              {strategy === "qqe" ? (
                <StrategyParamFields
                  strategy={strategy}
                  values={params}
                  disabled={false}
                  mid={mid}
                  section="size"
                  onChange={changeParam}
                />
              ) : null}
            </div>
            <AdditionalMarketsField
              market={market}
              extraMarkets={extraMarkets}
              markets={markets}
              isGrid={strategy === "grid"}
              hint="The same config also runs on each additional market — a strategy that only works on one market is usually curve-fit."
              onChange={setExtraMarkets}
            />
          </div>

          <StrategyParamCards
            strategy={strategy}
            values={params}
            disabled={false}
            mid={mid}
            onChange={changeParam}
          />

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          </TooltipProvider>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={submit}>
            {submitLabel}
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowRightIcon className="size-4" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
