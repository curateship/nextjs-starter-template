import * as React from "react"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  Loader2Icon,
  ShuffleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"
import { MarketPicker } from "@/components/trading/market-watchlist"
import { useMarketFavorites } from "@/lib/trading/use-market-favorites"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { BacktestGroupRun } from "@/lib/api/backtests"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { maxRunMarkets, maxWindowDays } from "@/lib/backtest/types"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"

import {
  BacktestMarketsTable,
  sortMarketRows,
  useMarketSort,
  type BacktestMarketRow,
} from "@/components/backtest/backtest-markets-table"
import type { AutomationBacktestState } from "./use-automation-backtest"

/** Nothing is pinned in the add-market picker; the list is already filtered. */
const EMPTY_MARKETS: ReadonlySet<string> = new Set()

/**
 * The editor's right panel while backtest mode is on: setup form → per-market
 * progress → the market list of results. Replaces the old launch dialog —
 * everything but markets and window comes from the saved Automation.
 */
export function AutomationBacktestSidePanel({
  backtest,
  interval,
  config,
  runnable,
  disabledReason,
  canSaveAndRerun,
  onSaveAndRerun,
}: {
  backtest: AutomationBacktestState
  interval: AutomationInterval
  /** The compiled Automation: sets the market cap's warm-up cost, and says
   * whether a DCA ladder runs the whole basket off one shared wallet. */
  config: AutomationConfig | null
  /** Compiled + saved — gates Run/New run live (edits mid-mode disable them). */
  runnable: boolean
  disabledReason?: string
  /** Unsaved tune-drag edits + a clean compile: offer one-click re-run. */
  canSaveAndRerun?: boolean
  onSaveAndRerun?: () => void
}) {
  const markets = useBinanceMarketRows()
  const { favorites, toggleFavorite } = useMarketFavorites()
  const [keepName, setKeepName] = React.useState("")
  const {
    phase,
    selectedMarkets,
    setSelectedMarkets,
    days,
    setDays,
    error,
    setError,
    starting,
    groupId,
    runs,
    runStats,
    progress,
    selectedRunId,
  } = backtest

  const isDca = Boolean(config?.dca)
  const maxDays = maxWindowDays(interval)
  // How many markets this run can still afford. A market costs its window of
  // candles plus the strategy's warm-up, and one run may only pull so many
  // bars in total — so the answer moves with the timeframe and the window,
  // not just with the basket cap. An unparseable day count falls back to the
  // longest window, which gives the smallest (safest) cap.
  const windowDaysForCap = Math.min(
    Math.max(Number.parseInt(days, 10) || maxDays, 1),
    maxDays
  )
  const marketCap = React.useMemo(
    () => maxRunMarkets(config, interval, windowDaysForCap),
    [config, interval, windowDaysForCap]
  )
  // The window is restored from the automation's last run, which may have been
  // on a coarser timeframe — 2083 days is fine at 1h and impossible at 15m. Pull
  // it back to the limit rather than holding a number the run can only reject.
  React.useEffect(() => {
    const current = Number.parseInt(days, 10)
    if (Number.isFinite(current) && current > maxDays) {
      setDays(String(maxDays))
      setError(null)
    }
  }, [days, maxDays, setDays, setError])
  // Set lookup, not `includes`: with hundreds of markets selected, filtering an
  // array inside an array walk is quadratic and re-runs on every price tick,
  // which locks up the panel.
  const selectedSet = React.useMemo(
    () => new Set(selectedMarkets),
    [selectedMarkets]
  )
  const availableMarkets = React.useMemo(
    () => markets.filter((row) => !selectedSet.has(row.coin)),
    [markets, selectedSet]
  )

  // Merge each market's group row with its polled stats into the shared
  // markets-table shape, then sort with the same comparator the /backtest
  // group dashboard uses.
  const marketSort = useMarketSort("net")
  const marketRows = React.useMemo<BacktestMarketRow[]>(
    () =>
      sortMarketRows(
        runs.map((run) => {
          const stats = runStats.get(run.id)
          return {
            id: run.id,
            market: run.market,
            status: run.status,
            netPnl: stats?.netPnl ?? null,
            netPnlPct: run.netPnlPct ?? stats?.netPnlPct ?? null,
            maxDrawdownPct: stats?.maxDrawdownPct ?? null,
            winRate: stats?.winRate ?? null,
            tradeCount: stats?.tradeCount ?? null,
          }
        }),
        marketSort.sortColumn,
        marketSort.sortDirection
      ),
    [runs, runStats, marketSort.sortColumn, marketSort.sortDirection]
  )

  // The shared-wallet basket runs as one block, so show a single percentage of
  // the replay rather than a per-market count (they finish together).
  const replayPct =
    runs.length > 0
      ? Math.round(
          Math.max(
            0,
            ...runs.map((run) => (run.status === "done" ? 100 : run.progress))
          )
        )
      : 0

  // Every basket edit goes through here: changing the selection can only fix
  // an over-the-cap error, so the stale message goes with it.
  const changeMarkets = (next: string[]) => {
    setSelectedMarkets(next)
    setError(null)
  }

  // Fill the basket with a fresh random draw up to the market cap for the
  // current timeframe and window — a fast way to grab a broad, unbiased spread
  // instead of hand-picking coins.
  const randomizeMarkets = () => {
    const pool = markets.map((row) => row.coin)
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    changeMarkets(pool.slice(0, marketCap))
  }

  // Liquidity baskets, split by daily traded value. The bands come from
  // splitting a 200-coin run by volume: the $1m-$10m tier produced the profit,
  // $10m-$50m lost money, and the biggest coins produced almost none of it.
  // Picking one deliberately is how you find out whether that holds on your own
  // runs instead of averaging the tiers together.
  //
  // Under $1m/day is left out of every band on purpose: those coins contributed
  // nothing measurable and are where a backtest's fill assumptions are least
  // believable.
  //
  // NOTE: this is TODAY's 24h volume from the ticker, not what the coin traded
  // during the window being tested. A coin can be liquid now and have been thin
  // then, so treat the split as a rough sort, not a guarantee.
  const CAP_BANDS = [
    { key: "low", label: "Low cap", low: 1_000_000, high: 10_000_000 },
    { key: "mid", label: "Mid cap", low: 10_000_000, high: 50_000_000 },
    {
      key: "high",
      label: "High cap",
      low: 50_000_000,
      high: Number.POSITIVE_INFINITY,
    },
  ] as const
  const bands = CAP_BANDS.map((band) => ({
    ...band,
    coins: markets
      .filter(
        (row) => row.dayVolumeUsd >= band.low && row.dayVolumeUsd < band.high
      )
      .map((row) => row.coin),
  }))
  const money = (value: number) =>
    value >= 1e9 ? `$${value / 1e9}b` : `$${value / 1e6}m`

  const submit = () => {
    const windowDays = Number(days)
    if (
      !Number.isInteger(windowDays) ||
      windowDays < 1 ||
      windowDays > maxDays
    ) {
      setError(
        `Days must be a whole number between 1 and ${maxDays} for ${interval} candles.`
      )
      return
    }
    if (selectedMarkets.length === 0) {
      setError("Pick at least one market.")
      return
    }
    // Reachable by lengthening the window after picking: the cap shrinks under
    // an already-chosen basket. Say what to remove instead of failing upstream.
    if (selectedMarkets.length > marketCap) {
      setError(
        `A ${interval} run over ${windowDays} days fits ${marketCap} ${
          marketCap === 1 ? "market" : "markets"
        }. Remove ${selectedMarkets.length - marketCap} or shorten the window.`
      )
      return
    }
    void backtest.start(windowDays)
  }

  const runButton = (label: string) => (
    <DisabledReasonTooltip reason={runnable ? undefined : disabledReason}>
      <Button
        type="button"
        size="sm"
        className="h-8 w-full"
        disabled={!runnable || starting}
        onClick={submit}
      >
        {starting ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {label}
      </Button>
    </DisabledReasonTooltip>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Backtest
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {phase === "setup"
            ? `${interval} candles`
            : phase === "running"
              ? "Running"
              : "Results"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          className={
            phase === "results"
              ? "flex flex-col gap-4"
              : "flex flex-col gap-4 p-3"
          }
        >
          {phase === "setup" ? (
            <>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  {/* Chosen / allowed. Kept to two numbers because this row
                      also carries two buttons in a narrow panel; the line under
                      the form spells out what the limit depends on. */}
                  <Label className="whitespace-nowrap">
                    Markets{" "}
                    <span className="font-normal text-muted-foreground">
                      {selectedMarkets.length}/{marketCap}
                    </span>
                  </Label>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={markets.length === 0}
                      onClick={randomizeMarkets}
                    >
                      <ShuffleIcon className="size-3.5" />
                      Randomize
                    </Button>
                    {bands.map((band) => (
                      <Button
                        key={band.key}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        disabled={band.coins.length === 0}
                        title={`Coins trading ${money(band.low)}${
                          Number.isFinite(band.high)
                            ? `-${money(band.high)}`
                            : "+"
                        } a day — ${band.coins.length} right now, capped at the ${marketCap} this run fits.`}
                        onClick={() =>
                          changeMarkets(band.coins.slice(0, marketCap))
                        }
                      >
                        {band.label}
                      </Button>
                    ))}
                    {selectedMarkets.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => changeMarkets([])}
                      >
                        Clear all
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedMarkets.map((coin) => (
                    <Badge
                      key={coin}
                      variant="secondary"
                      className="gap-1 font-mono"
                    >
                      {coin}
                      <button
                        type="button"
                        aria-label={`Remove ${coin}`}
                        onClick={() =>
                          changeMarkets(
                            selectedMarkets.filter((c) => c !== coin)
                          )
                        }
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {availableMarkets.length > 0 &&
                selectedMarkets.length < marketCap ? (
                  <MarketPicker
                    rows={availableMarkets}
                    selected=""
                    protectedMarkets={EMPTY_MARKETS}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    // Backtest rows come from Binance: price and 24h change
                    // only, so the funding/volume/open-interest columns are off.
                    metrics={false}
                    multiple
                    maxSelectable={marketCap - selectedMarkets.length}
                    onSelectMany={(coins) =>
                      changeMarkets(
                        [...new Set([...selectedMarkets, ...coins])].slice(
                          0,
                          marketCap
                        )
                      )
                    }
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal text-muted-foreground"
                      >
                        Add market
                        <ChevronDownIcon className="size-4" />
                      </Button>
                    }
                  />
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="backtest-days">
                  Days back{" "}
                  <span className="font-normal text-muted-foreground">
                    (max {maxDays} at {interval})
                  </span>
                </Label>
                <Input
                  id="backtest-days"
                  type="number"
                  min={1}
                  max={maxDays}
                  step={1}
                  className="w-32"
                  value={days}
                  onChange={(event) => {
                    setDays(event.target.value)
                    setError(null)
                  }}
                />
              </div>

              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </div>
              ) : null}

              <div className="grid gap-2">
                {runButton("Backtest")}
                {groupId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full"
                    onClick={backtest.backToResults}
                  >
                    Back to results
                  </Button>
                ) : null}
              </div>

              <p className="text-[11px] text-muted-foreground">
                {isDca ? "One shared DCA wallet" : "One run per market"} · max{" "}
                {marketCap} markets for a {windowDaysForCap}-day window at{" "}
                {interval}.
              </p>
            </>
          ) : phase === "running" ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${replayPct}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums">
                  {replayPct}%
                </span>
              </div>
              {progress.failed > 0 ? (
                <p className="text-[10px] text-destructive">
                  {progress.failed} failed.
                </p>
              ) : null}
              <div className="grid gap-2">
                {runs.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    Queuing markets…
                  </div>
                ) : (
                  runs.map((run) => (
                    <div key={run.id} className="grid gap-0.5 text-xs">
                      <div className="flex items-center gap-2">
                        <RunStatusIcon status={run.status} />
                        <span className="font-mono">{run.market}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {STATUS_LABELS[run.status]}
                        </span>
                      </div>
                      {run.status === "error" && run.error ? (
                        <p
                          className="line-clamp-2 pl-6 text-[10px] break-words text-destructive"
                          title={run.error}
                        >
                          {run.error}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Closing this panel is safe — runs keep going in the background
                and land in the backtest history.
              </p>
            </>
          ) : (
            <div className="grid gap-1">
              <BacktestMarketsTable
                rows={marketRows}
                state={marketSort}
                selectedId={selectedRunId}
                onSelect={(row) => backtest.selectRun(row.id)}
              />
              {backtest.selectedRunError ? (
                <p className="px-3 text-[10px] text-destructive">
                  Could not load that market's run — click it to retry.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>

      {phase === "results" ? (
        <div className="grid shrink-0 gap-3 border-t p-3">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          ) : null}
          <div className="flex items-stretch gap-2">
            <div className="flex-1">
              {canSaveAndRerun && onSaveAndRerun ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-full"
                  disabled={starting}
                  onClick={onSaveAndRerun}
                >
                  {starting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Save &amp; re-run
                </Button>
              ) : (
                runButton("Re-run")
              )}
            </div>
            <div className="flex-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full"
                onClick={backtest.newRun}
              >
                New run
              </Button>
            </div>
          </div>
          {backtest.replaceable ? (
            <div className="grid gap-2 rounded-md border bg-muted/40 p-2.5">
              <div className="flex items-center gap-2">
                <Input
                  value={keepName}
                  onChange={(event) => setKeepName(event.target.value)}
                  placeholder="Name this run to keep it"
                  aria-label="Run name"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!keepName.trim()}
                  onClick={() => {
                    void backtest.keep(keepName)
                    setKeepName("")
                  }}
                >
                  Keep
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Unnamed runs are replaced by your next backtest. Named runs stay
                in history forever.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Kept as “{backtest.groupName}” — your next backtest won't replace
              it.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

const STATUS_LABELS: Record<BacktestGroupRun["status"], string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  error: "Failed",
}

function RunStatusIcon({ status }: { status: BacktestGroupRun["status"] }) {
  if (status === "done") {
    return <CheckCircle2Icon className="size-4 text-emerald-500" />
  }
  if (status === "error") {
    return <XCircleIcon className="size-4 text-destructive" />
  }
  if (status === "running") {
    return <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
  }
  return <CircleDashedIcon className="size-4 text-muted-foreground" />
}

/** Same pattern as the toolbar: wrap disabled buttons so the reason shows. */
function DisabledReasonTooltip({
  reason,
  children,
}: {
  reason: string | undefined
  children: React.ReactNode
}) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="w-full rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  )
}
