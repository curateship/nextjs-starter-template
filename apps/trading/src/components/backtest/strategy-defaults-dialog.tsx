import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import {
  saveStrategyDefaults,
  type StrategyRunDefaults,
} from "@/lib/api/backtests"
import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

/**
 * Edits a strategy's default run configuration — parameters plus timeframe,
 * date range, equity, and fee/slippage assumptions. Every New Run for the
 * strategy seeds from these. Mount with `key={strategy}` so state resets.
 */
export function StrategyDefaultsDialog({
  strategy,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  strategy: StrategyType
  /** Current seeds: built-ins overlaid with the user's saved defaults. */
  initial: StrategyRunDefaults
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
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function resetToBuiltIns() {
    setValues(PARAM_DEFAULTS[strategy])
    setTimeframe("15m")
    setWindowDays("30")
    setEquity("10000")
    setTaker(String(DEFAULT_BACKTEST_COSTS.takerFeeBps))
    setMaker(String(DEFAULT_BACKTEST_COSTS.makerFeeBps))
    setSlippage(String(DEFAULT_BACKTEST_COSTS.slippageBps))
  }

  async function save() {
    setError(null)
    const windowNum = Number(windowDays)
    const equityNum = Number(equity)
    const takerNum = Number(taker)
    const makerNum = Number(maker)
    const slipNum = Number(slippage)
    if (!(windowNum >= 1 && windowNum <= 90)) {
      return setError("Date range must be between 1 and 90 days.")
    }
    if (!(equityNum > 0)) return setError("Starting equity must be positive.")
    if (!(takerNum >= 0 && takerNum <= 50) || !(makerNum >= 0 && makerNum <= 50)) {
      return setError("Fees must be between 0 and 50 bps.")
    }
    if (!(slipNum >= 0 && slipNum <= 100)) {
      return setError("Slippage must be between 0 and 100 bps.")
    }

    setBusy(true)
    try {
      await saveStrategyDefaults({
        strategyType: strategy,
        defaults: {
          params: values,
          interval,
          windowDays: Math.round(windowNum),
          equity: equityNum,
          takerFeeBps: takerNum,
          makerFeeBps: makerNum,
          slippageBps: slipNum,
        },
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Timeframe</Label>
              <Select
                value={interval}
                disabled={busy}
                onValueChange={(value) => setTimeframe(value as CandleInterval)}
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
              <Label>Date range (days back, 1–90)</Label>
              <Input
                value={windowDays}
                inputMode="numeric"
                disabled={busy}
                onChange={(event) => setWindowDays(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label>Starting equity (USD)</Label>
              <Input
                value={equity}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setEquity(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label>Slippage (bps, taker fills)</Label>
              <Input
                value={slippage}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setSlippage(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label>Taker fee (bps)</Label>
              <Input
                value={taker}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setTaker(event.target.value.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label>Maker fee (bps)</Label>
              <Input
                value={maker}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setMaker(event.target.value.trim())}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{STRATEGY_LABELS[strategy]} parameters</Label>
            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <StrategyParamFields
                strategy={strategy}
                values={values}
                disabled={busy}
                mid={0}
                onChange={(key, value) =>
                  setValues((current) => ({ ...current, [key]: value }))
                }
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
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={resetToBuiltIns}
          >
            Reset to built-ins
          </Button>
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
            Save defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
