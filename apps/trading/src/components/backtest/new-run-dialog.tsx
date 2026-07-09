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
  RiskControlsCard,
  StrategyParamCards,
  feeCostTip,
  feePctTip,
  orderSizeFromValues,
  riskErrorMessage,
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
import { Checkbox } from "@/components/ui/checkbox"
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
  runWalkForward,
  updateRunStatus,
  type StrategyDefaultsMap,
  type StrategyRunDefaults,
  type StrategyTemplate,
  type WalkForwardResult,
} from "@/lib/api/backtests"
import {
  DEFAULT_BACKTEST_COSTS,
  MAX_BACKTEST_BARS,
  maxWindowDays,
} from "@/lib/backtest/types"
import type { MarketRow } from "@/lib/hl/hooks"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  DEFAULT_BACKTEST_RISK_PARAMS,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyParamsSchema,
  type RiskParams,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

import type { RunDraft } from "./run-draft"

/** Backtestable strategies; copy needs event replay and stays live-only. */
const STRATEGY_CHOICES: StrategyType[] = ["momentum", "qqe", "vwap", "grid", "dca"]

/** Default grid range: ±10% around the market's mid. */
function gridBounds(mid: number) {
  return {
    lowerPx: (mid * 0.9).toPrecision(5),
    upperPx: (mid * 1.1).toPrecision(5),
  }
}

/** "Train 35d → test 15d out-of-sample" from the window + split inputs. */
function splitHint(windowDays: string, trainPct: string): string {
  const w = Number(windowDays)
  const tp = Number(trainPct) / 100
  if (!(w > 0) || !(tp >= 0.3 && tp <= 0.9)) return ""
  const train = Math.round(w * tp)
  return `Train ${train}d → test ${w - train}d out-of-sample`
}

const WF_VERDICT: Record<
  WalkForwardResult["verdict"],
  { label: string; tone: string; note: string }
> = {
  holds: {
    label: "Holds up",
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    note: "Out-of-sample return is positive and within range of training — the edge held on unseen data.",
  },
  weak: {
    label: "Weak",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    note: "Out-of-sample is positive but well below training — partial overfit. Size down and re-test.",
  },
  fails: {
    label: "Fails",
    tone: "bg-red-500/15 text-red-600 dark:text-red-400",
    note: "Out-of-sample is negative — the config was curve-fit to the training window. Don't trade it.",
  },
}

/** Train vs out-of-sample comparison for a completed walk-forward. */
function WalkForwardSummary({ result }: { result: WalkForwardResult }) {
  const badge = WF_VERDICT[result.verdict]
  const tone = (n: number) => (n >= 0 ? "text-emerald-600" : "text-red-500")
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
  const row = (label: string, p: WalkForwardResult["train"]) => {
    const daily = p.days > 0 ? p.netPnlPct / p.days : 0
    return (
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
        <span className="w-40 font-sans text-muted-foreground">{label}</span>
        <span className={tone(p.netPnlPct)}>{fmt(p.netPnlPct)} tot</span>
        <span className={tone(daily)}>{fmt(daily)}/day</span>
        <span>DD {p.maxDrawdownPct.toFixed(1)}%</span>
        <span>win {(p.winRate * 100).toFixed(0)}%</span>
        <span>n={p.trades}</span>
      </div>
    )
  }
  return (
    <div className="grid gap-2 rounded-md border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", badge.tone)}>
          {badge.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {result.markets.length} markets · includes fees + slippage
        </span>
      </div>
      {row(`Train (${result.train.days.toFixed(0)}d, in-sample)`, result.train)}
      {row(`Test (${result.test.days.toFixed(0)}d, out-of-sample)`, result.test)}
      <div className="text-[10px] text-muted-foreground">{badge.note}</div>
    </div>
  )
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
  const [risk, setRisk] = React.useState<RiskParams>(
    initial?.riskParams ?? DEFAULT_BACKTEST_RISK_PARAMS
  )
  // Optional blended fee %; when non-empty it overrides taker + maker bps.
  const [feePct, setFeePct] = React.useState(
    initialSeed.feePct != null ? String(initialSeed.feePct) : ""
  )
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Walk-forward: % of the window used to fit; the rest is held out to test.
  const [trainPct, setTrainPct] = React.useState("70")
  const [wfBusy, setWfBusy] = React.useState(false)
  const [wfResult, setWfResult] = React.useState<WalkForwardResult | null>(null)
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
    // Start from the template's saved risk when it has one, else research mode.
    setRisk(seed.riskParams ?? DEFAULT_BACKTEST_RISK_PARAMS)
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
    const maxWindow = maxWindowDays(interval, MAX_BACKTEST_BARS)
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(windowNum >= 1 && windowNum <= maxWindow)) {
      return setError(
        `Date range for ${interval} must be between 1 and ${maxWindow} days.`
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
    const riskError = riskErrorMessage(risk)
    if (riskError) return setError(riskError)
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
      riskParams: risk,
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

  /** Validate the config on a train window, then test it on held-out data. */
  function walkForward() {
    setError(null)
    setWfResult(null)
    const parsed = strategyParamsSchema.safeParse(buildParams(strategy, params))
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" · "))
      return
    }
    if (strategy === "copy") return setError("Copy trading can't be backtested.")
    const equityNum = Number(equity)
    const windowNum = Number(windowDays)
    const slipNum = Number(slippage)
    const trainFrac = Number(trainPct) / 100
    const maxWindow = maxWindowDays(interval, MAX_BACKTEST_BARS)
    let takerNum = Number(taker)
    let makerNum = Number(maker)
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(windowNum >= 4 && windowNum <= maxWindow)) {
      return setError(`Window must be 4–${maxWindow} days for a walk-forward split.`)
    }
    if (!(trainFrac >= 0.3 && trainFrac <= 0.9)) {
      return setError("Train split must be between 30% and 90%.")
    }
    if (feeOverride) {
      const p = Number(feePct)
      if (!(p >= 0 && p <= 0.5)) return setError("Fee % must be 0–0.5%.")
      takerNum = pctToBps(p)
      makerNum = pctToBps(p)
    } else if (!(takerNum >= 0 && takerNum <= 50) || !(makerNum >= 0 && makerNum <= 50)) {
      return setError("Fees must be between 0 and 50 bps.")
    }
    if (!(slipNum >= 0 && slipNum <= 100)) return setError("Slippage must be 0–100 bps.")
    const riskError = riskErrorMessage(risk)
    if (riskError) return setError(riskError)
    setWfBusy(true)
    void (async () => {
      try {
        const res = await runWalkForward({
          market,
          extraMarkets: extraMarkets.length ? extraMarkets : undefined,
          interval,
          windowDays: Math.round(windowNum),
          trainPct: trainFrac,
          startingEquity: equityNum,
          takerFeeBps: takerNum,
          makerFeeBps: makerNum,
          slippageBps: slipNum,
          params: parsed.data,
          riskParams: risk,
        })
        setWfResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Walk-forward failed")
      } finally {
        setWfBusy(false)
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

          {/* On a re-run the strategy is fixed, so the picker is redundant. */}
          {!lockStrategy ? (
            <div className="grid gap-2">
              <Label>Strategy</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {STRATEGY_CHOICES.map((type) => (
                  <button
                    key={type}
                    type="button"
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
          ) : null}

          {!lockStrategy && strategyTemplates.length > 0 ? (
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

          <div className="grid gap-5 rounded-lg border p-4">
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
                  Date range (days back, 1–{maxWindowDays(interval, MAX_BACKTEST_BARS)})
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
                <Label htmlFor="run-equity">Starting amount (USD)</Label>
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
            {strategy !== "copy" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="run-compounding"
                  checked={params.compounding === "true"}
                  onCheckedChange={(checked) =>
                    changeParam("compounding", checked === true ? "true" : "false")
                  }
                />
                <Label htmlFor="run-compounding" className="text-xs font-normal">
                  {strategy === "grid" || strategy === "dca"
                    ? "Compound (scale order sizes with the balance)"
                    : "Compound (reinvest the full balance each trade)"}
                </Label>
              </div>
            ) : null}
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

          <RiskControlsCard
            risk={risk}
            onChange={setRisk}
            busy={busy || wfBusy}
            description="These rules can stop a backtest early. Use research mode when you want to measure raw strategy drawdown."
          />

          {strategy !== "copy" ? (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div>
                <div className="text-sm font-medium">Walk-forward validation</div>
                <div className="text-[11px] text-muted-foreground">
                  Runs this exact config on a training window, then tests it on
                  the held-out remainder it never saw. If out-of-sample holds up,
                  the edge is real; if it collapses, it was curve-fit.
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="wf-train" className="text-xs">
                    Train split (%)
                  </Label>
                  <Input
                    id="wf-train"
                    className="h-8 w-24"
                    value={trainPct}
                    inputMode="numeric"
                    onChange={(event) => setTrainPct(event.target.value.trim())}
                  />
                </div>
                <span className="pb-2 text-[11px] text-muted-foreground">
                  {splitHint(windowDays, trainPct)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={wfBusy || busy}
                  onClick={walkForward}
                >
                  {wfBusy ? "Running…" : "Run walk-forward"}
                  {wfBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                </Button>
              </div>
              {wfResult ? <WalkForwardSummary result={wfResult} /> : null}
            </div>
          ) : null}

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
