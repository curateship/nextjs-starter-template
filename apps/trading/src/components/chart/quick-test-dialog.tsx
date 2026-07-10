import * as React from "react"
import { Loader2Icon } from "lucide-react"

import {
  pct,
  price as fmtPrice,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-format"
import { SettingsFields } from "@/components/strategies/settings-fields"
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
import { runBacktest } from "@/lib/api/backtests"
import { runQuickTest, type QuickTestResponse } from "@/lib/api/quick-test"
import { INDICATORS } from "@/lib/indicators/registry"
import type { StrategySettings } from "@/lib/strategies/settings"
import type { StrategyConfig } from "@/lib/strategies/strategy-config"

/**
 * Quick Test: replay the applied strategy over recent history — through the
 * exact engine backtests use — without leaving the chart. Results render
 * inline; "Save to library" stores the identical config as a normal backtest.
 */
export function QuickTestDialog({
  open,
  onOpenChange,
  network,
  market,
  config,
  settingsEditable = false,
  onResult,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The chart's exchange network — the test replays this same data. */
  network: "mainnet" | "testnet"
  market: string
  /** The strategy to test; null disables the dialog. */
  config: StrategyConfig | null
  /** Trade page: tweak the settings block before running (bots are fixed). */
  settingsEditable?: boolean
  /** Fired with the finished test (and again on close) so charts can paint it. */
  onResult?: (response: QuickTestResponse | null) => void
  /** Fired with the saved run's id after Save to library. */
  onSaved?: (backtestId: string) => void
}) {
  const [windowDays, setWindowDays] = React.useState("30")
  const [settings, setSettings] = React.useState<StrategySettings | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [response, setResponse] = React.useState<QuickTestResponse | null>(null)
  const [sort, setSort] = React.useState<{ col: TradeSortCol; dir: 1 | -1 }>({
    col: "n",
    dir: 1,
  })

  // Reset ONLY when the dialog opens. The bot page re-fetches its data every
  // few seconds, which re-creates the config object — keying on it here would
  // wipe a freshly shown result mid-read.
  const configRef = React.useRef(config)
  configRef.current = config
  React.useEffect(() => {
    if (!open) return
    setError(null)
    setResponse(null)
    setSettings(
      configRef.current ? { ...configRef.current.settings } : null
    )
  }, [open])

  if (!config) return null
  const module = INDICATORS[config.indicator.type]
  const testConfig: StrategyConfig = settings ? { ...config, settings } : config

  async function run() {
    setError(null)
    setBusy(true)
    try {
      const days = Math.max(1, Number(windowDays) || 30)
      const res = await runQuickTest({
        network,
        market,
        windowDays: days,
        config: testConfig,
      })
      setResponse(res)
      onResult?.(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed")
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const days = Math.max(1, Number(windowDays) || 30)
      const { backtestId } = await runBacktest({
        market,
        interval: testConfig.interval,
        windowDays: days,
        startingEquity: 10_000,
        params: testConfig,
      })
      onOpenChange(false)
      onSaved?.(backtestId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const result = response?.result ?? null
  const stats = result?.stats
  const trades = result
    ? [...result.trades].sort(
        (a, b) => (tradeSortValue(a, sort.col) - tradeSortValue(b, sort.col)) * sort.dir
      )
    : []

  const toggleSort = (col: TradeSortCol) =>
    setSort((s) => ({ col, dir: s.col === col ? ((s.dir * -1) as 1 | -1) : 1 }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy || saving) return
        if (!next) onResult?.(response)
        onOpenChange(next)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quick Test — {market}</DialogTitle>
          <DialogDescription>
            Replays {module.label} ({testConfig.interval}) over this chart's
            own {network} data through the same engine backtests use. Real
            fees and slippage included.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="qt-window" className="text-xs">
                Window (days)
              </Label>
              <Input
                id="qt-window"
                inputMode="numeric"
                value={windowDays}
                className="h-8 w-28 text-xs"
                onChange={(event) => setWindowDays(event.target.value.trim())}
              />
            </div>
          </div>

          {settingsEditable && settings ? (
            <div>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                Trade settings for this test
              </div>
              <SettingsFields value={settings} onChange={setSettings} />
            </div>
          ) : null}

          {stats ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-4 gap-2">
                <QuickStat
                  label="Net P&L"
                  value={pct(stats.netPnlPct)}
                  tone={stats.netPnlPct}
                  sub={signedUsd(stats.netPnl)}
                />
                <QuickStat
                  label="Trades"
                  value={String(stats.all.trades)}
                  sub={`${(stats.all.winRate * 100).toFixed(0)}% win`}
                />
                <QuickStat
                  label="Max DD"
                  value={pct(-Math.abs(stats.maxDrawdownPct))}
                  tone={-1}
                  sub={usd(Math.abs(stats.maxDrawdownUsd))}
                />
                <QuickStat
                  label="Fees"
                  value={usd(stats.fees)}
                  sub="incl. slippage"
                />
              </div>
              {stats.warnings?.length ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  {stats.warnings[0]}
                </div>
              ) : null}
              {result && result.trades.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/80 text-left">
                      <tr>
                        <SortTh label="#" col="n" sort={sort} onSort={toggleSort} />
                        <SortTh label="Side" col="side" sort={sort} onSort={toggleSort} />
                        <SortTh label="Entry" col="entry" sort={sort} onSort={toggleSort} />
                        <SortTh label="Exit" col="exit" sort={sort} onSort={toggleSort} />
                        <SortTh label="P&L" col="pnl" right sort={sort} onSort={toggleSort} />
                        <SortTh label="Return" col="return" right sort={sort} onSort={toggleSort} />
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {trades.map((trade) => (
                        <tr key={trade.n} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground">{trade.n}</td>
                          <td
                            className={
                              trade.side === "long"
                                ? "px-2 py-1 text-emerald-600"
                                : "px-2 py-1 text-red-500"
                            }
                          >
                            {trade.side}
                          </td>
                          <td className="px-2 py-1">{fmtPrice(trade.entryPx)}</td>
                          <td className="px-2 py-1">{fmtPrice(trade.exitPx)}</td>
                          <td className={`px-2 py-1 text-right ${toneClass(trade.pnl)}`}>
                            {signedUsd(trade.pnl)}
                          </td>
                          <td
                            className={`px-2 py-1 text-right ${toneClass(trade.returnPct)}`}
                          >
                            {pct(trade.returnPct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No completed trades in this window.
                </p>
              )}
            </div>
          ) : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              title="Saves as a standard backtest (Binance history) — numbers can differ slightly from this quick test's exchange data"
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save to library
            </Button>
          ) : null}
          <Button size="sm" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {result ? "Run again" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: number
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-sm font-semibold ${tone != null ? toneClass(tone) : ""}`}
      >
        {value}
      </div>
      {sub ? (
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  )
}

type TradeSortCol = "n" | "side" | "entry" | "exit" | "pnl" | "return"

/** Numeric key per column so every column sorts the same way. */
function tradeSortValue(
  trade: { n: number; side: string; entryPx: number; exitPx: number; pnl: number; returnPct: number },
  col: TradeSortCol
): number {
  switch (col) {
    case "n":
      return trade.n
    case "side":
      return trade.side === "long" ? 1 : 0
    case "entry":
      return trade.entryPx
    case "exit":
      return trade.exitPx
    case "pnl":
      return trade.pnl
    case "return":
      return trade.returnPct
  }
}

function SortTh({
  label,
  col,
  right = false,
  sort,
  onSort,
}: {
  label: string
  col: TradeSortCol
  right?: boolean
  sort: { col: TradeSortCol; dir: 1 | -1 }
  onSort: (col: TradeSortCol) => void
}) {
  const active = sort.col === col
  return (
    <th className={right ? "px-2 py-1 text-right font-medium" : "px-2 py-1 font-medium"}>
      <button
        type="button"
        className={
          "inline-flex items-center gap-0.5 hover:text-foreground " +
          (active ? "text-foreground" : "text-muted-foreground")
        }
        onClick={() => onSort(col)}
      >
        {label}
        <span className="w-2 text-[9px]">{active ? (sort.dir === 1 ? "\u25b2" : "\u25bc") : ""}</span>
      </button>
    </th>
  )
}
