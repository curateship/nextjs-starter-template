import * as React from "react"

import { BacktestKpis } from "@/components/backtest/backtest-kpis"
import { windowDaysOf } from "@/components/backtest/backtest-format"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BacktestDetail } from "@/lib/api/backtests"
import type { AutomationBacktestSettings } from "@/lib/automations/automation"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import {
  automationInputRows,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"

/**
 * The editor's left panel while backtest mode is on: the run's parameters and
 * the selected market's headline numbers — the one home for each. Before a
 * market is selected the rows show the editor's own (saved) settings.
 */
export function AutomationBacktestParamsPanel({
  selectedRun,
  interval,
  days,
  backtestSettings,
  config,
}: {
  /** The selected market's finished run — the immutable source of truth. */
  selectedRun: BacktestDetail | null
  interval: AutomationInterval
  /** Setup-form days, shown until a run is selected. */
  days: string
  backtestSettings: AutomationBacktestSettings
  /** Compiled config for strategy rows while nothing is selected. */
  config: AutomationConfig | null
}) {
  const rows = React.useMemo(() => {
    if (selectedRun) {
      const out: { label: string; value: string }[] = [
        { label: "Date range", value: `${windowDaysOf(selectedRun)}d back` },
        { label: "Timeframe", value: selectedRun.interval },
        { label: "Starting equity", value: `$${selectedRun.startingEquity}` },
        { label: "Taker fee", value: `${selectedRun.costs.takerFeeBps} bps` },
        { label: "Maker fee", value: `${selectedRun.costs.makerFeeBps} bps` },
        { label: "Slippage", value: `${selectedRun.costs.slippageBps} bps` },
      ]
      out.push(...automationInputRows(selectedRun.params))
      return out
    }
    const out: { label: string; value: string }[] = [
      { label: "Date range", value: `${days || "—"}d back` },
      { label: "Timeframe", value: interval },
      { label: "Starting equity", value: `$${backtestSettings.startingEquity}` },
      { label: "Taker fee", value: `${backtestSettings.takerFeeBps} bps` },
      { label: "Maker fee", value: `${backtestSettings.makerFeeBps} bps` },
      { label: "Slippage", value: `${backtestSettings.slippageBps} bps` },
    ]
    if (config) out.push(...automationInputRows(config))
    return out
  }, [selectedRun, interval, days, backtestSettings, config])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          {selectedRun ? `Backtest · ${selectedRun.market}` : "Backtest params"}
        </h2>
        <span className="text-[10px] text-muted-foreground">Read-only</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <BacktestKpis
          stats={selectedRun?.result?.stats ?? null}
          className="p-3"
        />
        <div className="grid content-start gap-1.5 p-3 pt-0">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-right font-mono text-[11px] tabular-nums">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
