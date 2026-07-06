import * as React from "react"
import { ArrowRightIcon } from "lucide-react"

import { StrategyParamFields } from "@/components/bots/strategy-param-fields"
import {
  buildParams,
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
import type {
  StrategyDefaultsMap,
  StrategyRunDefaults,
} from "@/lib/api/backtests"
import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
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
const STRATEGY_CHOICES: StrategyType[] = ["momentum", "grid", "dca"]

/** Default grid range: ±10% around the market's mid. */
function gridBounds(mid: number) {
  return {
    lowerPx: (mid * 0.9).toPrecision(5),
    upperPx: (mid * 1.1).toPrecision(5),
  }
}

/**
 * Configures a run draft: name → strategy → market → parameters. Continue
 * hands the draft to the chart workspace, where price levels can be tuned
 * visually (drag grid bounds / SL / TP) before the first execution.
 */
export function NewRunDialog({
  open,
  onOpenChange,
  markets,
  defaultMarket,
  defaultInterval,
  defaultStrategy = "momentum",
  userDefaults,
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
  onContinue: (draft: RunDraft) => void
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

  const initialStrategy = defaultStrategy === "copy" ? "momentum" : defaultStrategy
  const initialSeed = seedFor(initialStrategy)
  const initialInterval = initialSeed.interval ?? defaultInterval

  const [name, setName] = React.useState("")
  const [strategy, setStrategy] = React.useState<StrategyType>(initialStrategy)
  const [market, setMarket] = React.useState(defaultMarket)
  const [interval, setTimeframe] = React.useState<CandleInterval>(initialInterval)
  const [windowDays, setWindowDays] = React.useState(
    String(initialSeed.windowDays ?? 30)
  )
  const [equity, setEquity] = React.useState(String(initialSeed.equity ?? 10_000))
  const [taker, setTaker] = React.useState(
    String(initialSeed.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(initialSeed.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(initialSeed.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  const [params, setParams] = React.useState<ParamValues>(() =>
    initialStrategy === "momentum"
      ? { ...initialSeed.params, interval: initialInterval }
      : initialSeed.params
  )
  const [error, setError] = React.useState<string | null>(null)

  const midOf = (coin: string) =>
    Number(markets.find((row) => row.coin === coin)?.markPx ?? 0)
  const mid = midOf(market)

  function selectStrategy(next: StrategyType) {
    setStrategy(next)
    setError(null)
    const seed = seedFor(next)
    const nextInterval = seed.interval ?? interval
    setTimeframe(nextInterval)
    if (seed.windowDays) setWindowDays(String(seed.windowDays))
    if (seed.equity) setEquity(String(seed.equity))
    if (seed.takerFeeBps !== undefined) setTaker(String(seed.takerFeeBps))
    if (seed.makerFeeBps !== undefined) setMaker(String(seed.makerFeeBps))
    if (seed.slippageBps !== undefined) setSlippage(String(seed.slippageBps))
    if (next === "momentum") {
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

  function selectMarket(coin: string) {
    setMarket(coin)
    if (strategy === "grid") {
      const coinMid = midOf(coin)
      if (coinMid > 0) {
        setParams((current) => ({ ...current, ...gridBounds(coinMid) }))
      }
    }
  }

  function selectTimeframe(next: CandleInterval) {
    setTimeframe(next)
    if (strategy === "momentum") {
      setParams((current) => ({ ...current, interval: next }))
    }
  }

  function changeParam(key: string, value: string) {
    setParams((current) => ({ ...current, [key]: value }))
    if (key === "interval" && strategy === "momentum") {
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
    const takerNum = Number(taker)
    const makerNum = Number(maker)
    const slipNum = Number(slippage)
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(windowNum >= 1 && windowNum <= 90)) {
      return setError("Date range must be between 1 and 90 days.")
    }
    if (!(takerNum >= 0 && takerNum <= 50) || !(makerNum >= 0 && makerNum <= 50)) {
      return setError("Fees must be between 0 and 50 bps.")
    }
    if (!(slipNum >= 0 && slipNum <= 100)) {
      return setError("Slippage must be between 0 and 100 bps.")
    }
    if (strategy === "copy") return

    onOpenChange(false)
    setName("")
    onContinue({
      name: name.trim() || undefined,
      strategy,
      market,
      interval,
      windowDays: Math.round(windowNum),
      equity: equityNum,
      takerFeeBps: takerNum,
      makerFeeBps: makerNum,
      slippageBps: slipNum,
      params,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New Backtest Run</DialogTitle>
          <DialogDescription>
            Name the run, pick a strategy and market, then set its parameters.
            Continue to fine-tune price levels on the chart before running.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
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

          <div className="grid gap-2">
            <Label>Strategy</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGY_CHOICES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectStrategy(type)}
                  className={cn(
                    "rounded-md border p-3 text-left text-sm hover:bg-muted/50",
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Market</Label>
              <Select value={market} onValueChange={selectMarket}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(markets.length > 0 ? markets.map((row) => row.coin) : [market]).map(
                    (coin) => (
                      <SelectItem key={coin} value={coin}>
                        {coin}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Timeframe</Label>
              <Select
                value={interval}
                onValueChange={(value) => selectTimeframe(value as CandleInterval)}
              >
                <SelectTrigger className="w-full">
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
              <Label htmlFor="run-window">Date range (days back, 1–90)</Label>
              <Input
                id="run-window"
                value={windowDays}
                inputMode="numeric"
                onChange={(event) => setWindowDays(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="run-equity">Starting equity (USD)</Label>
              <Input
                id="run-equity"
                value={equity}
                inputMode="decimal"
                onChange={(event) => setEquity(event.target.value.trim())}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="run-taker">Taker fee (bps)</Label>
              <Input
                id="run-taker"
                value={taker}
                inputMode="decimal"
                onChange={(event) => setTaker(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="run-maker">Maker fee (bps)</Label>
              <Input
                id="run-maker"
                value={maker}
                inputMode="decimal"
                onChange={(event) => setMaker(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="run-slippage">Slippage (bps)</Label>
              <Input
                id="run-slippage"
                value={slippage}
                inputMode="decimal"
                onChange={(event) => setSlippage(event.target.value.trim())}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{STRATEGY_LABELS[strategy]} parameters</Label>
            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <StrategyParamFields
                strategy={strategy}
                values={params}
                disabled={false}
                mid={mid}
                onChange={changeParam}
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            Continue
            <ArrowRightIcon className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
