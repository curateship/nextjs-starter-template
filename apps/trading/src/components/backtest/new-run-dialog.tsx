import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { runBacktest } from "@/lib/api/backtests"
import {
  loadStrategies,
  type StrategyListItem,
} from "@/lib/api/strategies"
import {
  DEFAULT_BACKTEST_COSTS,
  MAX_EXTRA_MARKETS,
  maxWindowDays,
} from "@/lib/backtest/types"
import { INDICATORS } from "@/lib/indicators/registry"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import {
  settingsSummary,
  StrategyPicker,
} from "@/components/strategies/strategy-picker"

type MarketRowLike = { coin: string }

/** Prefill for re-running an existing run group with the same strategy. */
export type RunEditTarget = {
  groupId: string
  name: string
  market: string
  extraMarkets: string[]
  windowDays: number
  equity: number
  takerFeeBps: number
  makerFeeBps: number
  slippageBps: number
  config: StrategyConfig
}

/**
 * New Backtest Run (new model): pick a saved strategy, the markets, and the
 * window — the run launches straight into the queue. The strategy's indicator
 * and settings come from its saved config; edit those on the Strategies page.
 */
export function NewRunDialog({
  open,
  onOpenChange,
  markets,
  defaultMarket,
  editTarget,
  onLaunched,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  markets: MarketRowLike[]
  defaultMarket: string
  /** Re-run mode: locked strategy config, prefilled run settings. */
  editTarget?: RunEditTarget
  /** Receives the main run's id once the run group is queued. */
  onLaunched: (backtestId: string) => void | Promise<void>
}) {
  const [strategies, setStrategies] = React.useState<StrategyListItem[] | null>(
    null
  )
  const [strategyId, setStrategyId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [market, setMarket] = React.useState(defaultMarket)
  const [extraMarkets, setExtraMarkets] = React.useState<string[]>([])
  const [windowDays, setWindowDays] = React.useState("30")
  const [equity, setEquity] = React.useState("10000")
  const [taker, setTaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.takerFeeBps)
  )
  const [maker, setMaker] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.makerFeeBps)
  )
  const [slippage, setSlippage] = React.useState(
    String(DEFAULT_BACKTEST_COSTS.slippageBps)
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setName(editTarget?.name ?? "")
    setMarket(editTarget?.market ?? defaultMarket)
    setExtraMarkets(editTarget?.extraMarkets ?? [])
    setWindowDays(String(editTarget?.windowDays ?? 30))
    setEquity(String(editTarget?.equity ?? 10_000))
    setTaker(String(editTarget?.takerFeeBps ?? DEFAULT_BACKTEST_COSTS.takerFeeBps))
    setMaker(String(editTarget?.makerFeeBps ?? DEFAULT_BACKTEST_COSTS.makerFeeBps))
    setSlippage(
      String(editTarget?.slippageBps ?? DEFAULT_BACKTEST_COSTS.slippageBps)
    )
    if (editTarget) return
    let cancelled = false
    void loadStrategies()
      .then(({ strategies: rows }) => {
        if (!cancelled) setStrategies(rows)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load strategies")
      )
    return () => {
      cancelled = true
    }
  }, [open, editTarget, defaultMarket])

  const strategy = editTarget
    ? null
    : (strategies?.find((row) => row.id === strategyId) ?? null)
  const config = editTarget?.config ?? strategy?.config ?? null

  const availableMarkets = markets.filter(
    (row) => row.coin !== market && !extraMarkets.includes(row.coin)
  )

  async function submit() {
    setError(null)
    if (!config) return setError("Pick a strategy.")
    const days = Number(windowDays)
    if (!(days >= 1)) return setError("Window must be at least 1 day.")
    const maxDays = maxWindowDays(config.interval)
    if (days > maxDays) {
      return setError(
        `That window is too long for ${config.interval} candles — at most ${maxDays} days.`
      )
    }
    const startingEquity = Number(equity)
    if (!(startingEquity > 0)) return setError("Equity must be positive.")

    setBusy(true)
    try {
      const { backtestId } = await runBacktest({
        name: name.trim() || undefined,
        groupId: editTarget?.groupId,
        market,
        extraMarkets,
        interval: config.interval,
        windowDays: days,
        startingEquity,
        takerFeeBps: Number(taker),
        makerFeeBps: Number(maker),
        slippageBps: Number(slippage),
        params: config,
      })
      onOpenChange(false)
      await onLaunched(backtestId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Re-run Backtest" : "New Backtest Run"}</DialogTitle>
          <DialogDescription>
            {editTarget
              ? "Adjust the markets, window, or costs and re-run this group with the same strategy."
              : "Pick a saved strategy and the markets to replay it on — one result per market. The strategy's indicator and settings come from the Strategies page."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="run-name">Name (optional)</Label>
            <Input
              id="run-name"
              value={name}
              placeholder="Named after the strategy when empty"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {editTarget ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {INDICATORS[editTarget.config.indicator.type]?.label ??
                  editTarget.config.indicator.type}
              </span>{" "}
              · {editTarget.config.interval} · {settingsSummary(editTarget.config)}{" "}
              — the strategy is fixed for this run group.
            </div>
          ) : (
            <StrategyPicker
              strategies={strategies}
              selectedId={strategyId}
              onSelect={(id) => {
                setStrategyId(id)
                setError(null)
              }}
            />
          )}

          {config ? (
            <>
              <div className="grid gap-2">
                <Label>Main market</Label>
                <Select value={market} onValueChange={setMarket}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {markets.map((row) => (
                      <SelectItem key={row.coin} value={row.coin}>
                        {row.coin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>
                  Extra markets{" "}
                  <span className="font-normal text-muted-foreground">
                    (same strategy replayed on each · max {MAX_EXTRA_MARKETS})
                  </span>
                </Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {extraMarkets.map((coin) => (
                    <Badge key={coin} variant="secondary" className="gap-1 font-mono">
                      {coin}
                      <button
                        type="button"
                        aria-label={`Remove ${coin}`}
                        onClick={() =>
                          setExtraMarkets((current) =>
                            current.filter((c) => c !== coin)
                          )
                        }
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  {availableMarkets.length > 0 &&
                  extraMarkets.length < MAX_EXTRA_MARKETS ? (
                    <Select
                      value=""
                      onValueChange={(coin) =>
                        setExtraMarkets((current) =>
                          current.includes(coin) ? current : [...current, coin]
                        )
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Add market" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMarkets.map((row) => (
                          <SelectItem key={row.coin} value={row.coin}>
                            {row.coin}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="run-window">
                    Window (days) — timeframe {config.interval}
                  </Label>
                  <Input
                    id="run-window"
                    inputMode="numeric"
                    value={windowDays}
                    onChange={(event) => setWindowDays(event.target.value.trim())}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="run-equity">Starting equity (USD, per market)</Label>
                  <Input
                    id="run-equity"
                    inputMode="decimal"
                    value={equity}
                    onChange={(event) => setEquity(event.target.value.trim())}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>
                  Costs{" "}
                  <span className="font-normal text-muted-foreground">
                    (basis points — realistic fees keep results honest)
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Taker</span>
                    <Input
                      inputMode="decimal"
                      value={taker}
                      onChange={(event) => setTaker(event.target.value.trim())}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Maker</span>
                    <Input
                      inputMode="decimal"
                      value={maker}
                      onChange={(event) => setMaker(event.target.value.trim())}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Slippage</span>
                    <Input
                      inputMode="decimal"
                      value={slippage}
                      onChange={(event) => setSlippage(event.target.value.trim())}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
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
          <Button
            type="button"
            disabled={busy || !config}
            onClick={() => void submit()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {editTarget ? "Re-run" : "Run backtest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
