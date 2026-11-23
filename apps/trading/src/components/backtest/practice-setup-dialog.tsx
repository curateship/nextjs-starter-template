import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDownIcon } from "lucide-react"

import { MarketPicker } from "@/components/trading/market-watchlist"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import {
  MANUAL_RISK_PCT_MAX,
  MANUAL_RISK_PCT_MIN,
} from "@/lib/backtest/manual-types"
import {
  BACKTEST_INTERVALS,
  maxWindowDays,
  type BacktestInterval,
} from "@/lib/backtest/types"
import { useMarketFavorites } from "@/lib/trading/use-market-favorites"

export type PracticeConfig = {
  market: string
  interval: BacktestInterval
  days: number
  equity: number
  riskPct: number
}

const EMPTY_MARKETS: ReadonlySet<string> = new Set()

/** Days of history a new session starts behind, before the per-timeframe cap. */
const DEFAULT_WINDOW_DAYS = 365

/**
 * The "Practice" setup modal: pick a market, timeframe, window, wallet, and
 * risk — Start opens the session route. Lives apart from the session screen so
 * the pages that only offer the button (Backtest, Trade) don't also carry the
 * replay engine.
 */
export function PracticeSetupDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Seeds the form (e.g. "New run" from a session re-opens with its config). */
  initial?: Partial<PracticeConfig>
}) {
  const navigate = useNavigate()
  const markets = useBinanceMarketRows()
  const { favorites, toggleFavorite } = useMarketFavorites()
  const [market, setMarket] = React.useState(initial?.market ?? "BTC")
  const [interval, setInterval] = React.useState<BacktestInterval>(
    initial?.interval ?? "15m"
  )
  // A year of runway by default — enough history for a session to walk through
  // several market moods rather than one stretch of one regime.
  const [windowDays, setWindowDays] = React.useState(
    String(initial?.days ?? DEFAULT_WINDOW_DAYS)
  )
  const [equity, setEquity] = React.useState(String(initial?.equity ?? 10000))
  const [riskPct, setRiskPct] = React.useState(String(initial?.riskPct ?? 1))
  const [error, setError] = React.useState<string | null>(null)

  const windowCap = maxWindowDays(interval)

  function start() {
    const days = Math.round(Number(windowDays))
    const startingEquity = Number(equity)
    const risk = Number(riskPct)
    if (!Number.isFinite(days) || days < 1 || days > windowCap) {
      setError(
        `The window must be between 1 and ${windowCap} days at ${interval}.`
      )
      return
    }
    if (!Number.isFinite(startingEquity) || startingEquity <= 0) {
      setError("Starting money must be a positive number.")
      return
    }
    if (
      !Number.isFinite(risk) ||
      risk < MANUAL_RISK_PCT_MIN ||
      risk > MANUAL_RISK_PCT_MAX
    ) {
      setError(
        `Risk per trade must be between ${MANUAL_RISK_PCT_MIN}% and ${MANUAL_RISK_PCT_MAX}%.`
      )
      return
    }
    setError(null)
    // No onOpenChange(false) here: navigation unmounts (or remounts) the
    // host screen, and closing first would reset a session's discard flag
    // and re-arm its leave-warning against this very navigation.
    void navigate({
      to: "/backtest/practice",
      search: {
        market,
        interval,
        days,
        equity: startingEquity,
        risk,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual practice session</DialogTitle>
          <DialogDescription>
            Rewind the past and trade by drawing long/short boxes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="practice-market">Market</FieldLabel>
                  <MarketPicker
                    rows={markets}
                    selected={market}
                    protectedMarkets={EMPTY_MARKETS}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    metrics={false}
                    modal
                    onSelect={setMarket}
                    trigger={
                      <Button
                        id="practice-market"
                        type="button"
                        variant="outline"
                        className="w-full justify-between sm:w-32"
                      >
                        {market}
                        <ChevronDownIcon className="size-4 text-muted-foreground" />
                      </Button>
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="practice-interval">Timeframe</FieldLabel>
                  <Select
                    value={interval}
                    onValueChange={(value) => {
                      const next = value as BacktestInterval
                      setInterval(next)
                      // Finer candles cover fewer days for the same bar
                      // budget, so a window that no longer fits snaps to the
                      // new ceiling instead of failing on Start.
                      const cap = maxWindowDays(next)
                      const days = Number(windowDays)
                      if (Number.isFinite(days) && days > cap) {
                        setWindowDays(String(cap))
                      }
                    }}
                  >
                    <SelectTrigger
                      id="practice-interval"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BACKTEST_INTERVALS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="practice-window"
                    hint={`How far back the session starts. At ${interval} candles it can cover up to ${windowCap} days.`}
                  >
                    Days back
                  </FieldLabel>
                  <Input
                    id="practice-window"
                    type="number"
                    min={1}
                    max={windowCap}
                    value={windowDays}
                    onChange={(event) => setWindowDays(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel htmlFor="practice-equity">
                    Starting money ($)
                  </FieldLabel>
                  <Input
                    id="practice-equity"
                    type="number"
                    min={1}
                    value={equity}
                    onChange={(event) => setEquity(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="practice-risk"
                    hint="Each trade is sized so that hitting your stop loses exactly this percent of the wallet. A tighter stop means a bigger position, a wider stop a smaller one."
                  >
                    Risk per trade (%)
                  </FieldLabel>
                  <Input
                    id="practice-risk"
                    type="number"
                    min={MANUAL_RISK_PCT_MIN}
                    max={MANUAL_RISK_PCT_MAX}
                    step={0.25}
                    value={riskPct}
                    onChange={(event) => setRiskPct(event.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={start}>
            Start session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
